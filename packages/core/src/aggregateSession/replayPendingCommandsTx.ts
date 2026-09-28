import {
  isZerospinError,
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Context, Effect, Result, Schema } from 'effect';

import { applyAggregateSessionMutationTx } from '../contracts/applyAggregateSessionMutationTx.ts';
import { decodePayload } from '../contracts/decodePayload/decodePayload.ts';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '../contracts/encodeAppliedMutation.ts';
import { encodeFailure } from '../contracts/failureCodec.ts';
import { makeMutations } from '../contracts/make/makeMutations.ts';
import { runContractGuard } from '../contracts/runContractGuard.ts';
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
      if (
        command.execution.status !== 'pending' ||
        command.admission.status === 'failed'
      ) {
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
            const made = yield* runContractGuard({
              contract,
              queryDb: replayTx,
              claims,
              payload,
            })
              .pipe(
                Effect.andThen(
                  makeMutations({
                    contract,
                    models: definition.models,
                    command: { ...command, payload },
                    claims,
                  }),
                ),
              )
              .pipe(
                runProgram,
                Effect.provideContext(context),
                Effect.catch(failure =>
                  encodeFailure(contract, failure).pipe(
                    Effect.flatMap(retained =>
                      retained.scope !== undefined
                        ? Effect.fail(
                            makeZerospinError(
                              'pending-command-business-failure',
                            ),
                          )
                        : Effect.fail(makeZerospinError(retained)),
                    ),
                  ),
                ),
              );
            const mutations = [];
            for (const [mutationIndex, mutation] of made.mutations.entries()) {
              const applied = yield* applyAggregateSessionMutationTx({
                tx: replayTx,
                mutation,
                commandId: command.id,
                mutationIndex,
                appliedAt: command.staging.startedAt,
              });
              mutations.push(
                yield* encodeAppliedMutation({ mutation: applied }),
              );
            }
            return mutations;
          }),
      }).pipe(Effect.provideContext(context), Effect.result);
      if (
        Result.isFailure(replayed) &&
        ![
          'pending-command-business-failure',
          'mutation-row-not-found',
          'mutation-referential-integrity-failed',
          'service-resource-deleted',
        ].includes(
          isZerospinError(replayed.failure) ? replayed.failure.code : '',
        )
      ) {
        return yield* Effect.fail(replayed.failure);
      }
      const mutations = yield* Schema.encodeEffect(
        Schema.fromJsonString(Schema.Array(EncodedAppliedMutationSchema)),
      )(Result.isSuccess(replayed) ? replayed.success : []).pipe(
        mapParseError({
          code: 'session-optimistic-mutations-encode-failed',
          prefix: 'Failed to encode rebased optimism',
        }),
      );
      tx.insert(sessionRepoDbConfig.schema.optimisticAppliedMutations)
        .values({ commandId: command.id, mutations })
        .onConflictDoUpdate({
          target:
            sessionRepoDbConfig.schema.optimisticAppliedMutations.commandId,
          set: { mutations },
        })
        .run();
    }
  },
);
