import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { prefixActorId } from '@zerospin/core/utils/prefixActorId';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { main } from '../fixtures/system.js';
import { managedRuntime } from '../managedRuntime.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { ActorRepo } from './ActorRepo.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { getActorRepo } from './getActorRepo/getActorRepo.js';

describe('ActorRepo finite drain', () => {
  it.effect(
    'drains 201 retained rows in bounded batches without regressing an interleaved durable acknowledgement',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_actor_finite_drain_interleaving',
          accountId: makeAccountId({ id: 'actor-finite-drain-interleaving' }),
          accountName: main.accountName,
          actorId: prefixActorId('actor-finite-drain-interleaving'),
          actorName: main.actorName,
        };

        const result = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getActorRepo,
            repo: ActorRepo,
            key,
            fn: async ({ db, storage }) => {
              // 1. Build more than two publication batches without constructing
              //    an in-memory fixture array. Every retained row is otherwise
              //    the smallest valid actor block payload.
              storage.sql.exec(`
                WITH RECURSIVE retainedActorBlocks(accountIndex) AS (
                  SELECT 1
                  UNION ALL
                  SELECT accountIndex + 1
                  FROM retainedActorBlocks
                  WHERE accountIndex < 201
                )
                INSERT INTO actorBlockOutbox (
                  pushedBlockId,
                  lastAccountCursor,
                  accountIndex,
                  executedCommands,
                  failedCommands,
                  appliedMutations,
                  deltas,
                  failure
                )
                SELECT
                  NULL,
                  'acur_actor_finite_drain_' || printf('%03d', accountIndex),
                  accountIndex,
                  '[]',
                  '[]',
                  '[]',
                  '{}',
                  NULL
                FROM retainedActorBlocks
              `);

              // 2. Hold the first drain after ActorBlockRepo accepts its first
              //    batch but before ActorRepo advances the durable watermark.
              //    The second drain can then advance through all 201 rows first.
              let markFirstAcknowledgementHeld: (() => void) | undefined;
              const firstAcknowledgementHeld = new Promise<void>(resolve => {
                markFirstAcknowledgementHeld = resolve;
              });
              let releaseFirstAcknowledgement: (() => void) | undefined;
              const firstAcknowledgementRelease = new Promise<void>(resolve => {
                releaseFirstAcknowledgement = resolve;
              });
              const delayedStorage = new Proxy(storage, {
                get(target, property) {
                  if (property === 'get') {
                    return target.get.bind(target);
                  }
                  if (property === 'transaction') {
                    return async (
                      transactionProgram: Parameters<
                        DurableObjectStorage['transaction']
                      >[0],
                    ) => {
                      markFirstAcknowledgementHeld?.();
                      await firstAcknowledgementRelease;
                      return target.transaction(transactionProgram);
                    };
                  }
                  return undefined;
                },
              });
              const firstDrain = managedRuntime.runPromise(
                drainGeneration({
                  db,
                  key,
                  inspectionOnly: false,
                  storage: delayedStorage,
                }).pipe(Effect.provide(AsyncLive)),
              );
              await firstAcknowledgementHeld;

              // 3. A fully independent drain reaches the terminal row while the
              //    older acknowledgement is still suspended.
              const secondDrain = await managedRuntime.runPromise(
                drainGeneration({
                  db,
                  key,
                  inspectionOnly: false,
                  storage,
                }).pipe(Effect.provide(AsyncLive)),
              );
              const acknowledgementBeforeOlderCompletion =
                await storage.get<number>(
                  'lastPublishedActorBlockAccountIndex',
                );

              // 4. Releasing the older completion must observe 201 and retain
              //    it rather than writing its stale first-batch bound of 100.
              releaseFirstAcknowledgement?.();
              const completedFirstDrain = await firstDrain;
              const acknowledgementAfterOlderCompletion =
                await storage.get<number>(
                  'lastPublishedActorBlockAccountIndex',
                );

              return {
                acknowledgementBeforeOlderCompletion,
                acknowledgementAfterOlderCompletion,
                completedFirstDrain,
                secondDrain,
              };
            },
          }),
        );

        expect(result.secondDrain).toEqual({ pendingActorBlockCount: 0 });
        expect(result.completedFirstDrain).toEqual({
          pendingActorBlockCount: 0,
        });
        expect(result.acknowledgementBeforeOlderCompletion).toBe(201);
        expect(result.acknowledgementAfterOlderCompletion).toBe(201);
      }).pipe(Effect.provide(AsyncLive)),
  );
});
