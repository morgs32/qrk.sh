import {
  isZerospinError,
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import { sql } from 'drizzle-orm';
import { Effect, Result, Schema, type Scope } from 'effect';

import { applyOperationTx } from '../contracts/applyOperationTx.ts';
import { decodePayload } from '../contracts/decodePayload/decodePayload.ts';
import {
  encodeAppliedOperation,
  EncodedAppliedOperationSchema,
} from '../contracts/encodeAppliedOperation.ts';
import { encodeFailure } from '../contracts/failureCodec.ts';
import { makeOperations } from '../contracts/make/makeOperations.ts';
import type { ExcludeOperationSink } from '../contracts/operationSink.ts';
import { prepareContractInput } from '../contracts/prepareContractInput.ts';
import type { ITx } from '../drizzle/types.ts';
import { withSavepoint } from '../drizzle/withSavepoint.ts';
import { runProgram } from '../execution/runProgram.ts';

import { sessionRepoDbConfig } from './sessionRepoDbConfig.ts';
import type { IAggregateSessionDefinition } from './types.ts';
export type IAggregateSessionReplayRequirements<
  DEFINITION extends IAggregateSessionDefinition,
> = '__initializeRequirements' extends keyof DEFINITION
  ? Exclude<NonNullable<DEFINITION['__initializeRequirements']>, Scope.Scope>
  :
      | ExcludeOperationSink<
          Effect.Services<
            ReturnType<
              DEFINITION['contracts'][keyof DEFINITION['contracts']]['program']
            >
          >
        >
      | ExcludeOperationSink<
          Effect.Services<
            ReturnType<
              NonNullable<
                DEFINITION['contracts'][keyof DEFINITION['contracts']]['guard']
              >
            >
          >
        >;

/** Re-derive pending commands in submission order; only inverse bookkeeping survives each replay. */
export function replayPendingCommandsTx<
  DEFINITION extends IAggregateSessionDefinition,
>(props: {
  tx: ITx;
  definition: DEFINITION;
}): Effect.Effect<
  void,
  IAnyError,
  IAggregateSessionReplayRequirements<DEFINITION>
>;
export function replayPendingCommandsTx(props: {
  tx: ITx;
  definition: IAggregateSessionDefinition;
}) {
  return replay(props);
}
const replay = Effect.fn('replayPendingCommandsTx')(function* (props: {
  tx: ITx;
  definition: IAggregateSessionDefinition;
}): Effect.fn.Return<void, IAnyError, unknown> {
  const { tx, definition } = props;
  const rows = tx
    .select()
    .from(sessionRepoDbConfig.schema.commands)
    // Accepted commands follow Node order; uncertain local commands follow retention order.
    .orderBy(
      sql`${sessionRepoDbConfig.schema.commands.nodeIndex} IS NULL`,
      sessionRepoDbConfig.schema.commands.nodeIndex,
      sessionRepoDbConfig.schema.commands.sessionIndex,
    )
    .all();
  for (const row of rows) {
    const command = yield* sessionRepoDbConfig.tables.commands
      .decodeRow(row)
      .pipe(
        mapParseError({
          code: 'pending-command-invalid',
          prefix: 'Invalid pending command',
        }),
      );
    // Selected outcomes are retained history, not pending work.
    if (command.executedIndex !== null) {
      continue;
    }
    if (
      command.payload === null ||
      command.contractVersion === null ||
      command.claims === null ||
      command.staging === null
    ) {
      return yield* makeZerospinError('pending-command-input-missing');
    }
    const commandId = yield* Schema.decodeUnknownEffect(
      makeAbbreviationIdSchema('cmd'),
    )(command.id).pipe(
      mapParseError({
        code: 'pending-command-id-invalid',
        prefix: 'Invalid staged command ID',
      }),
    );
    const startedAt = command.staging.startedAt;
    const contractVersion = command.contractVersion;
    const contract = definition.contracts[command.commandName];
    if (contract === undefined) {
      return yield* Effect.fail(
        makeZerospinError('pending-command-contract-missing'),
      );
    }
    if (
      command.actorName !== definition.actorName ||
      command.actorVersion !== definition.actorVersion
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'pending-command-actor-mismatch',
          message: 'Pending command belongs to another actor version',
        }),
      );
    }
    const claims = yield* Schema.decodeUnknownEffect(definition.claimsSchema)(
      command.claims,
    ).pipe(
      mapParseError({
        code: 'pending-command-claims-invalid',
        prefix: 'Invalid pending claims',
      }),
    );
    const payload = yield* decodePayload(contract, {
      command: {
        ...command,
        payload: command.payload,
        contractVersion: command.contractVersion,
      },
    });
    const replayed = yield* withSavepoint({
      tx,
      program: ({ tx: replayTx }) =>
        Effect.gen(function* () {
          const input = yield* prepareContractInput({
            contract,
            command: { payload },
            claims,
          });
          const made = yield* makeOperations({
            db: replayTx,
            contract,
            models: definition.models,
            command: {
              id: commandId,
              commandName: command.commandName,
              contractVersion,
            },
            input,
          }).pipe(
            runProgram,
            Effect.catch(failure =>
              encodeFailure(contract, failure).pipe(
                Effect.flatMap(retained =>
                  retained.scope !== undefined
                    ? Effect.fail(
                        makeZerospinError('pending-command-business-failure'),
                      )
                    : Effect.fail(makeZerospinError(retained)),
                ),
              ),
            ),
          );
          const operations = [];
          for (const [operationIndex, operation] of made.operations.entries()) {
            if (operation.operationName === 'async') {
              return yield* makeZerospinError(
                'browser-async-operation-forbidden',
              );
            }
            const applied = yield* applyOperationTx({
              tx: replayTx,
              operation,
              commandId,
              operationIndex,
              appliedAt: startedAt,
            });
            operations.push(
              yield* encodeAppliedOperation({ operation: applied }),
            );
          }
          return operations;
        }),
    }).pipe(Effect.result);
    if (
      Result.isFailure(replayed) &&
      ![
        'pending-command-business-failure',
        'operation-row-not-found',
        'operation-referential-integrity-failed',
        'service-resource-deleted',
      ].includes(isZerospinError(replayed.failure) ? replayed.failure.code : '')
    ) {
      return yield* Effect.fail(replayed.failure);
    }
    const operations = yield* Schema.encodeEffect(
      Schema.fromJsonString(Schema.Array(EncodedAppliedOperationSchema)),
    )(Result.isSuccess(replayed) ? replayed.success : []).pipe(
      mapParseError({
        code: 'session-optimistic-operations-encode-failed',
        prefix: 'Failed to encode rebased optimism',
      }),
    );
    tx.insert(sessionRepoDbConfig.schema.optimisticAppliedOperations)
      .values({ sessionIndex: command.sessionIndex, operations })
      .onConflictDoUpdate({
        target:
          sessionRepoDbConfig.schema.optimisticAppliedOperations.sessionIndex,
        set: { operations },
      })
      .run();
  }
});
