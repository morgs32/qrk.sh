import { applyAggregateMutationTx } from '@zerospin/core/contracts/applyAggregateMutationTx';
import {
  AggregateChainedCommandSchema,
  AggregateExecutionEntrySchema,
} from '@zerospin/core/contracts/CommandSchema';
import { prepareReplayAppliedMutation } from '@zerospin/core/contracts/prepareReplayAppliedMutation';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import type { initializeGuards } from '@zerospin/core/guards/initializeGuards';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';
import type { system } from 'system';

import { advanceDispositionHash } from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import {
  VersionedAggregateRepoDb,
  versionedAggregateRepoDbConfig,
} from '../versionedAggregateRepoDbConfig.js';

/** Atomically execute a prepared page and commit contiguous version-owned results.
 * Page failures roll back all writes; domain rejection rolls back one command.
 *
 * 1. Install provisional replicas, then run guards before aggregate-owned mutations.
 * 2. Separate domain rejection from infrastructure failure.
 * 3. Commit terminal history with resource state.
 */
export const executeCommandsTx = makeTx(
  'VersionedAggregateRepo.executeCommandsTx',
  VersionedAggregateRepoDb,
)(function* (props: {
  head:
    | typeof versionedAggregateRepoDbConfig.schema.head.$inferSelect
    | undefined;
  preparedPage: readonly {
    entry: typeof AggregateExecutionEntrySchema.Type;
    failure: IAnyError | null;
    executionInput: {
      payload: unknown;
    } | null;
  }[];
  aggregate: (typeof system.aggregates)[string][string];
  guards: Effect.Success<
    ReturnType<typeof initializeGuards<never, unknown, unknown>>
  >;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: string;
  };
}) {
  const { head, preparedPage, aggregate, guards, key } = props;

  // 1 — install provisional replicas, then run guards before aggregate-owned mutations
  const tx = yield* VersionedAggregateRepoDb.Tx;
  if (!head) {
    return yield* new ZerospinError({
      code: 'aggregate-head-missing',
      message:
        'VAR activation must initialize the original aggregate spec before execution',
    });
  }
  let dispositionHash = head.dispositionHash;
  let cursor = head.aggregateIndex;
  for (const prepared of preparedPage) {
    const entry = prepared.entry;
    const { command, executionTimestamp } = entry;
    if (command.aggregateIndex !== cursor + 1) {
      return yield* new ZerospinError({
        code: 'aggregate-execution-gap',
        message: 'Admitted history is not contiguous',
      });
    }
    let authoredRejection: IAnyError | null = prepared.failure;
    const replayMutations = [...entry.mutations];
    const applied = yield* withSavepoint({
      tx,
      program: ({ tx: commandTx }) =>
        Effect.gen(function* () {
          if (prepared.failure !== null) {
            return yield* prepared.failure;
          }
          // Replica copies are provisional command state and are visible to both guards.
          for (let index = 0; index < replayMutations.length; index++) {
            const mutation = replayMutations[index];
            if (
              mutation === undefined ||
              mutation.operationName !== 'replicate'
            ) {
              continue;
            }
            const replica = yield* prepareReplayAppliedMutation({
              mutation,
              controller: aggregate,
            });
            if (replica === null || replica.operationName !== 'replicate') {
              continue;
            }
            const { serviceName, serviceVersion, serviceIndex } =
              replica.operation;
            if (
              serviceVersion === undefined ||
              serviceIndex === undefined ||
              !Number.isSafeInteger(serviceIndex) ||
              serviceIndex < 0 ||
              aggregate.services[serviceName] !== serviceVersion
            ) {
              return yield* new ZerospinError({
                code: 'replica-source-invalid',
                message:
                  'Replication requires the pinned service version and a valid source position',
              });
            }
            const source = commandTx
              .select()
              .from(versionedAggregateRepoDbConfig.schema.services)
              .where(
                eq(
                  versionedAggregateRepoDbConfig.schema.services.serviceName,
                  serviceName,
                ),
              )
              .get();
            if (
              source === undefined ||
              aggregate.services[serviceName] !== serviceVersion
            ) {
              return yield* new ZerospinError({
                code: 'replica-source-invalid',
                message:
                  'Replication requires an activation-declared service source',
              });
            }
            const current = commandTx
              .select()
              .from(replica.model.drizzleSchema)
              .where(eq(replica.model.drizzleSchema.id, replica.resourceId))
              .get();
            const enrolled =
              current === undefined
                ? undefined
                : yield* Schema.decodeUnknownEffect(
                    Schema.Struct({ serviceIndex: Schema.Number }),
                  )(current).pipe(
                    mapParseError({
                      code: 'replica-resource-invalid',
                      prefix: 'Invalid retained replica position',
                    }),
                  );
            const effectiveIndex =
              enrolled === undefined
                ? serviceIndex
                : Math.max(enrolled.serviceIndex, source.lastIndex);
            if (current !== undefined && effectiveIndex >= serviceIndex) {
              const encoded = yield* Schema.encodeEffect(
                replica.model.resourceSchema,
              )(current).pipe(
                mapParseError({
                  code: 'replica-resource-invalid',
                  prefix: 'Invalid retained replica copy',
                }),
              );
              replayMutations[index] = {
                ...mutation,
                operation: JSON.stringify({
                  serviceName,
                  serviceVersion,
                  serviceIndex: effectiveIndex,
                  resource: { ...encoded, serviceIndex: effectiveIndex },
                }),
              };
            } else {
              yield* applyAggregateMutationTx({
                tx: commandTx,
                mutation: replica,
                commandId: command.id,
                mutationIndex: mutation.mutationIndex,
                appliedAt: executionTimestamp,
              });
            }
          }
          yield* getByKeyOrThrow({
            record: aggregate.contracts,
            key: command.commandName,
            recordKind: 'aggregate contracts',
          });
          // Reuse the prepared program payload independently of the original occurrence.
          if (prepared.executionInput === null) {
            return yield* new ZerospinError({
              code: 'aggregate-guard-inputs-missing',
              message: 'Prepared aggregate guard inputs are missing',
            });
          }
          const { payload } = prepared.executionInput;
          yield* guards
            .run(command.commandName, {
              db: commandTx,
              userId: command.userId,
              payload,
            })
            .pipe(
              Effect.tapError(error =>
                Effect.sync(() => {
                  if (error.code !== 'guard-must-be-synchronous') {
                    authoredRejection = error;
                  }
                }),
              ),
            );
          for (const mutation of entry.mutations) {
            if (mutation.operationName === 'replicate') continue;
            const prepared = yield* prepareReplayAppliedMutation({
              mutation,
              controller: aggregate,
            });
            if (prepared !== null) {
              yield* applyAggregateMutationTx({
                tx: commandTx,
                mutation: prepared,
                commandId: command.id,
                mutationIndex: mutation.mutationIndex,
                appliedAt: executionTimestamp,
              });
            }
          }
        }),
    }).pipe(Effect.result);

    // 2 — advance known command failures after savepoint rollback; abort other failures
    if (
      Result.isFailure(applied) &&
      applied.failure !== authoredRejection &&
      ![
        'mutation-row-not-found',
        'mutation-referential-integrity-failed',
        'service-resource-deleted',
      ].includes(applied.failure.code)
    ) {
      return yield* applied.failure;
    }

    // 3 — advance the disposition hash and write executedCommands outbox plus head in the page transaction
    dispositionHash = advanceDispositionHash({
      previousDispositionHash: dispositionHash,
      aggregateIndex: command.aggregateIndex,
      commandId: command.id,
      disposition: Result.isFailure(applied) ? 'failure' : 'success',
    });
    const terminal = yield* Schema.decodeUnknownEffect(
      Schema.toType(AggregateChainedCommandSchema),
    )({
      ...command,
      failedAt: Result.isFailure(applied)
        ? executionTimestamp
        : command.failedAt,
      failure: Result.isFailure(applied)
        ? Schema.encodeSync(ZerospinError.schema)(applied.failure)
        : command.failure,
      dispositionHash,
    }).pipe(
      mapParseError({
        code: 'aggregate-terminal-invalid',
        prefix: 'Invalid terminal occurrence',
      }),
    );
    const bytes = yield* Schema.encodeEffect(
      Schema.fromJsonString(AggregateExecutionEntrySchema),
    )({
      ...entry,
      mutations: replayMutations,
      command: terminal,
    }).pipe(
      mapParseError({
        code: 'aggregate-terminal-encode-failed',
        prefix: 'Failed to encode terminal result',
      }),
    );
    tx.insert(versionedAggregateRepoDbConfig.schema.executedCommands)
      .values({
        outboxIndex: command.aggregateIndex,
        entry: bytes,
        executionVersion: key.aggregateVersion,
        deliveredAt: null,
        lastDeliveryFailure: null,
      })
      .run();
    tx.update(versionedAggregateRepoDbConfig.schema.head)
      .set({
        aggregateIndex: command.aggregateIndex,
        dispositionHash,
      })
      .where(eq(versionedAggregateRepoDbConfig.schema.head.singletonId, 1))
      .run();
    cursor = command.aggregateIndex;
  }
});
