import { applyAggregateMutationTx } from '@zerospin/core/contracts/applyAggregateMutationTx';
import { prepareReplayAppliedMutation } from '@zerospin/core/contracts/prepareReplayAppliedMutation';
import type { IEncodedMutation } from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import { isZerospinError } from '@zerospin/error';
import { Effect, Result } from 'effect';

import { makeActorSnapshotDb } from '../validateCommands/makeActorSnapshotDb.js';

/** Rebuild a disposable optimistic database from the durable confirmed base and saved operations. */
export const makeOptimisticActorDb = Effect.fn('makeOptimisticActorDb')(
  function* (props: {
    authoritativeDb: IDb;
    models: IAnyModels;
    pending: readonly {
      commandId: string;
      appliedAt: Date;
      mutations: readonly IEncodedMutation[];
    }[];
  }) {
    const { authoritativeDb, models, pending } = props;
    const scratch = yield* makeActorSnapshotDb(
      makeResourceDbConfig({ models }),
    );

    // Copy the full resource graph: selection membership can change under optimism.
    for (const model of Object.values(models)) {
      const rows = authoritativeDb.select().from(model.drizzleSchema).all();
      if (rows.length > 0) {
        scratch.db.insert(model.drizzleSchema).values(rows).run();
      }
    }

    const unappliedCommandIds: string[] = [];
    for (const command of pending) {
      const replayed = yield* makeTx('ActorOptimism.replay')(function* (tx) {
        for (const encoded of command.mutations) {
          if (encoded.commandId !== command.commandId) {
            return yield* Effect.die(
              new Error('Pending mutation belongs to a different command'),
            );
          }
          const mutation = yield* prepareReplayAppliedMutation({
            mutation: encoded,
            controller: { models },
          });
          yield* applyAggregateMutationTx({
            tx,
            mutation,
            commandId: command.commandId,
            mutationIndex: encoded.mutationIndex,
            appliedAt: command.appliedAt,
          });
        }
      })(scratch.db).pipe(Effect.result);
      if (Result.isSuccess(replayed)) continue;
      const failure = replayed.failure;
      if (
        isZerospinError(failure) &&
        [
          'mutation-row-not-found',
          'mutation-referential-integrity-failed',
          'service-resource-deleted',
        ].includes(failure.code)
      ) {
        unappliedCommandIds.push(command.commandId);
        continue;
      }
      return yield* Effect.fail(failure);
    }

    return { ...scratch, unappliedCommandIds };
  },
);
