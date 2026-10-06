import { applyOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import {
  AggregateTerminalCommandSchema,
  type AggregateChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { type IFailure } from '@zerospin/core/contracts/failureCodec';
import type { IAsyncOperation } from '@zerospin/core/contracts/make/mapContractVersion';
import { prepareReplayAppliedOperation } from '@zerospin/core/contracts/prepareReplayAppliedOperation';
import type { IAnyOperation, IContract } from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import type { IAnyModels } from '@zerospin/core/models/types';
import {
  encodeError,
  isZerospinError,
  makeZerospinError,
  mapParseError,
  PublicFailureSchema,
  type IAnyError,
} from '@zerospin/error';
import type config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';

import { advanceDispositionHash } from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import { prepareAsyncOperation } from '../../asyncOperations/prepareAsyncOperation.js';
import {
  encodeOwnedOperation,
  type IOwnedOperation,
} from '../../ownedOperations.js';
import { aggregateVersionRepoDbConfig } from '../aggregateVersionRepoDbConfig.js';
/** Atomically commit one prepared command and its version-owned result.
 * Domain rejection retains a failed terminal record without resource changes.
 *
 * 1. Apply the already checked program operations in their returned order.
 * 2. Separate domain rejection from infrastructure failure.
 * 3. Commit terminal history with resource state.
 */
export const executeCommandsTx = makeTx(
  'AggregateVersionRepo.executeCommandsTx',
)(function* (
  tx: ITx<
    IResourceDbConfig<IAnyModels, typeof aggregateVersionRepoDbConfig.tables>
  >,
  props: {
    head:
      | typeof aggregateVersionRepoDbConfig.schema.head.$inferSelect
      | undefined;
    preparedPage: readonly {
      command: typeof AggregateChainedCommandSchema.Type;
      startedAt: Date;
      originalExecutionVersion: string;
      operations: readonly (
        | IOwnedOperation
        | (IAsyncOperation & { commandId: string; operationIndex: number })
      )[];
      encodedResult: typeof Schema.Json.Type;
      contractVersion: string;
      failure: IFailure | null;
      contract: IContract | null;
      payload: unknown;
      guard: (
        db: Readonly<Pick<IDb, 'query'>>,
      ) => Effect.Effect<void, IFailure | IAnyError, unknown>;
    }[];
    aggregate: (typeof config.system.aggregates)[string][string];
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
    };
  },
) {
  const { head, preparedPage, aggregate, key } = props;
  // 1 — apply prepared operations in program result order
  const liveHead = tx
    .select()
    .from(aggregateVersionRepoDbConfig.schema.head)
    .where(eq(aggregateVersionRepoDbConfig.schema.head.singletonId, 1))
    .get();
  if (!liveHead) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-head-missing',
        message:
          'VAR activation must initialize the original aggregate spec before execution',
      }),
    );
  }
  if (
    head === undefined ||
    liveHead.aggregateIndex !== head.aggregateIndex ||
    liveHead.dispositionHash !== head.dispositionHash
  ) {
    return yield* makeZerospinError('aggregate-execution-head-conflict');
  }
  let dispositionHash = liveHead.dispositionHash;
  let cursor = liveHead.aggregateIndex;
  let executedIndex = liveHead.executedIndex;
  for (const prepared of preparedPage) {
    const { command, startedAt } = prepared;
    if (command.aggregateIndex !== cursor + 1) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'aggregate-execution-gap',
          message: 'Admitted history is not contiguous',
        }),
      );
    }
    let authoredRejection: IFailure | null = prepared.failure;
    const applied =
      command.admission.status === 'failed'
        ? Result.succeed(undefined)
        : authoredRejection !== null
          ? Result.fail(authoredRejection)
          : yield* withSavepoint({
              tx,
              program: ({ tx: commandTx }) =>
                Effect.gen(function* () {
                  yield* prepared.guard(commandTx).pipe(
                    Effect.tapError(failure =>
                      Effect.sync(() => {
                        if ('scope' in failure) {
                          authoredRejection = failure;
                        }
                      }),
                    ),
                  );
                  const recordOutput = (
                    operation: IAnyOperation | IOwnedOperation,
                    operationIndex: number,
                  ) =>
                    Effect.gen(function* () {
                      const encoded = !('model' in operation)
                        ? operation
                        : yield* encodeOwnedOperation({
                            commandId: command.id,
                            operationIndex,
                            output: operation,
                          });
                      const bytes =
                        yield* aggregateVersionRepoDbConfig.tables.modelOperations
                          .encodeRow({
                            ...encoded,

                            executedIndex: executedIndex + 1,
                            committedAt: startedAt,
                          })
                          .pipe(
                            mapParseError({
                              code: 'operation-row-encode-failed',
                              prefix: 'Invalid owned output',
                            }),
                          );
                      commandTx
                        .insert(
                          aggregateVersionRepoDbConfig.schema.modelOperations,
                        )
                        .values(bytes)
                        .run();
                    });
                  const applyAndRecord = (
                    operation: IAnyOperation,
                    operationIndex: number,
                  ) =>
                    Effect.gen(function* () {
                      yield* applyOperationTx({
                        tx: commandTx,
                        operation,
                        commandId: command.id,
                        operationIndex,
                        appliedAt: startedAt,
                      });
                      yield* recordOutput(operation, operationIndex);
                    });
                  // Preserve program order, of owned operations; dependency failures roll back this savepoint.
                  const seen = new Set<number>();
                  for (const operation of prepared.operations) {
                    if (seen.has(operation.operationIndex)) {
                      return yield* makeZerospinError(
                        'duplicate-operation-index',
                      );
                    }
                    seen.add(operation.operationIndex);
                    if (operation.operationName === 'async') {
                      const original =
                        prepared.originalExecutionVersion ===
                        key.aggregateVersion;
                      const encoded = yield* prepareAsyncOperation({
                        operation,
                        commandId: command.id,
                        operationIndex: operation.operationIndex,
                        committedAt: startedAt,
                        original,
                        actor: aggregate.actors[command.actorName],
                        claims: command.claims,
                      });
                      commandTx
                        .insert(
                          aggregateVersionRepoDbConfig.schema.asyncOperations,
                        )
                        .values({
                          ...encoded,
                          executedIndex: executedIndex + 1,
                          systemName: original ? command.systemName : null,
                        })
                        .run();
                      continue;
                    }
                    const decodedOperation =
                      yield* prepareReplayAppliedOperation({
                        operation,
                        controller: aggregate,
                      });
                    yield* applyAndRecord(
                      decodedOperation,
                      operation.operationIndex,
                    );
                  }
                }),
            }).pipe(Effect.result);
    // 2 — advance known command failures after savepoint rollback; abort other failures
    if (
      Result.isFailure(applied) &&
      applied.failure !== authoredRejection &&
      ![
        'operation-row-not-found',
        'operation-referential-integrity-failed',
        'service-resource-deleted',
      ].includes(isZerospinError(applied.failure) ? applied.failure.code : '')
    ) {
      return yield* Effect.fail(
        isZerospinError(applied.failure)
          ? applied.failure
          : makeZerospinError('unexpected-business-failure'),
      );
    }
    const executionFailure = Result.isFailure(applied)
      ? yield* Schema.decodeUnknownEffect(PublicFailureSchema)(
          isZerospinError(applied.failure) && 'cause' in applied.failure
            ? yield* encodeError(applied.failure)
            : applied.failure,
        ).pipe(
          mapParseError({
            code: 'command-failure-invalid',
            prefix: 'Invalid failure',
          }),
        )
      : null;
    // 3 — advance the disposition hash and write commands outbox plus head in the page transaction
    dispositionHash = advanceDispositionHash({
      failure:
        command.admission.status === 'failed'
          ? command.admission.failure
          : executionFailure,
      previousDispositionHash: dispositionHash,
      aggregateIndex: command.aggregateIndex,
      commandId: command.id,
      disposition:
        command.admission.status === 'failed' || Result.isFailure(applied)
          ? 'failure'
          : 'success',
    });
    const terminal = yield* Schema.decodeUnknownEffect(
      Schema.toType(AggregateTerminalCommandSchema),
    )({
      ...command,
      execution:
        command.admission.status === 'failed'
          ? { status: 'skipped', reason: 'admission-failed' }
          : executionFailure !== null
            ? {
                status: 'failed',
                startedAt,
                completedAt: new Date(),
                failure: executionFailure,
              }
            : {
                status: 'succeeded',
                contractVersion: prepared.contractVersion,
                result: prepared.encodedResult,
                startedAt,
                completedAt: new Date(),
              },
      dispositionHash,
    }).pipe(
      mapParseError({
        code: 'aggregate-terminal-invalid',
        prefix: 'Invalid terminal occurrence',
      }),
    );
    const bytes =
      yield* aggregateVersionRepoDbConfig.tables.executedCommandOutbox
        .encodeRow({
          ...terminal,
          response: terminal.response ?? null,
          aggregateVersion:
            'aggregateVersion' in terminal ? terminal.aggregateVersion : null,
          executedIndex: ++executedIndex,
          executionVersion: key.aggregateVersion,
          originalExecutionVersion: prepared.originalExecutionVersion,
          lastDeliveryFailure: null,
        })
        .pipe(
          mapParseError({
            code: 'aggregate-terminal-encode-failed',
            prefix: 'Failed to encode terminal result',
          }),
        );
    tx.insert(aggregateVersionRepoDbConfig.schema.executedCommandOutbox)
      .values(bytes)
      .run();
    if (prepared.originalExecutionVersion === key.aggregateVersion) {
      tx.insert(
        aggregateVersionRepoDbConfig.schema.executedAggregateCommandOutbox,
      )
        .values(bytes)
        .run();
    }
    tx.update(aggregateVersionRepoDbConfig.schema.head)
      .set({
        aggregateIndex: command.aggregateIndex,
        executedIndex,
        dispositionHash,
      })
      .where(eq(aggregateVersionRepoDbConfig.schema.head.singletonId, 1))
      .run();
    cursor = command.aggregateIndex;
  }
});
