import {
  isZerospinError,
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Context, Effect, Result, Schema } from 'effect';

import { applyOperationTx } from '../contracts/applyOperationTx.ts';
import { decodePayload } from '../contracts/decodePayload/decodePayload.ts';
import {
  encodeAppliedOperation,
  EncodedAppliedOperationSchema,
} from '../contracts/encodeAppliedOperation.ts';
import { encodeFailure } from '../contracts/failureCodec.ts';
import { makeOperations } from '../contracts/make/makeOperations.ts';
import type { ITx } from '../drizzle/types.ts';
import { withSavepoint } from '../drizzle/withSavepoint.ts';
import { runProgram } from '../execution/runProgram.ts';

import { sessionRepoDbConfig } from './sessionRepoDbConfig.ts';
import type { IAggregateSessionDefinition } from './types.ts';
/** Re-derive pending commands in submission order; only inverse bookkeeping survives each replay. */
export const replayPendingCommandsTx = Effect.fn('replayPendingCommandsTx')(
  function* (props: {
    tx: ITx;
    definition: IAggregateSessionDefinition;
  }): Effect.fn.Return<void, IAnyError> {
    const { tx, definition } = props;
    // Registry-selected contracts erase their service types. Preserve the caller's
    // runtime capabilities and bind database/claims per replay below.
    const ambient = yield* Effect.context<never>();
    const context = Context.makeUnsafe<unknown>(ambient.mapUnsafe);
    const rows = tx
      .select()
      .from(sessionRepoDbConfig.schema.commands)
      // Session indexes restart on acquisition; row order preserves the
      // unadmitted command order across execution identities.
      .orderBy(
        sql`${sessionRepoDbConfig.schema.commands.pushIndex} IS NULL`,
        sessionRepoDbConfig.schema.commands.pushIndex,
        sql`rowid`,
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
      // Selected outcomes are retained journal history, not pending work.
      if (command.executedIndex !== null) {
        continue;
      }
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
      const payload = yield* decodePayload(contract, { command });
      const replayed = yield* withSavepoint({
        tx,
        program: ({ tx: replayTx }) =>
          Effect.gen(function* () {
            const made = yield* makeOperations({
              db: replayTx,
              contract,
              models: definition.models,
              command: { ...command, payload },
              claims,
            }).pipe(
              runProgram,
              Effect.provideContext(context),
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
            for (const [
              operationIndex,
              operation,
            ] of made.operations.entries()) {
              if (operation.operationName === 'async') {
                return yield* makeZerospinError(
                  'browser-async-operation-forbidden',
                );
              }
              const applied = yield* applyOperationTx({
                tx: replayTx,
                operation,
                commandId: command.id,
                operationIndex,
                appliedAt: command.staging.startedAt,
              });
              operations.push(
                yield* encodeAppliedOperation({ operation: applied }),
              );
            }
            return operations;
          }),
      }).pipe(Effect.provideContext(context), Effect.result);
      if (
        Result.isFailure(replayed) &&
        ![
          'pending-command-business-failure',
          'operation-row-not-found',
          'operation-referential-integrity-failed',
          'service-resource-deleted',
        ].includes(
          isZerospinError(replayed.failure) ? replayed.failure.code : '',
        )
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
        .values({ commandId: command.id, operations })
        .onConflictDoUpdate({
          target:
            sessionRepoDbConfig.schema.optimisticAppliedOperations.commandId,
          set: { operations },
        })
        .run();
    }
  },
);
