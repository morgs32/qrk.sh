import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { prefixActorId } from '@zerospin/core/utils/prefixActorId';
import { runInDurableObject } from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { main, system } from '../fixtures/system.js';
import { FrontendRepo } from '../FrontendRepo/FrontendRepo.js';
import { getFrontendRepo } from '../FrontendRepo/getFrontendRepo/getFrontendRepo.js';
import { managedRuntime } from '../managedRuntime.js';
import { openGeneration } from '../openGeneration/openGeneration.js';
import { prepareGeneration } from '../prepareGeneration/prepareGeneration.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { ActorBlockRepo } from './ActorBlockRepo.js';
import { drainFrontendSubscribers } from './drainFrontendSubscribers/drainFrontendSubscribers.js';
import { getActorBlockRepo } from './getActorBlockRepo/getActorBlockRepo.js';

describe('ActorBlockRepo finite drain', () => {
  it.effect(
    'force-drains 101 archived actor blocks through one subscriber and clears its retry alarm',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_actor_block_finite_drain_101';
        const deployId = 'dpl_actor_block_finite_drain_101';
        const accountId = makeAccountId({ id: 'actor-block-finite-drain-101' });
        const actorId = prefixActorId('actor-block-finite-drain-101');
        const actorKey = {
          generationId,
          accountId,
          accountName: main.accountName,
          actorId,
          actorName: main.actorName,
        };
        const frontendKey = {
          ...actorKey,
          frontendName: main.frontendName,
        };

        yield* prepareGeneration({
          deployId,
          generationId,
          prevGenerationId: null,
          systemSpec: makeSystemSpec({ system }),
          seeds: [],
        });
        yield* openGeneration({ deployId, generationId });

        const frontendRepo = yield* getFrontendRepo({ key: frontendKey });
        yield* makeAsync(() =>
          frontendRepo.getFrontendState({
            accountId,
            accountName: main.accountName,
            actorId,
            actorName: main.actorName,
            frontendName: main.frontendName,
            systemWorkerName: 'system-worker-actor-block-finite-drain-101',
            lineage: { mode: 'live', predecessor: null },
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const frontendRepoName =
          yield* FrontendRepo.repoUtils.nameUtils.makeName(frontendKey);
        const actorBlockRepo = yield* getActorBlockRepo({ key: actorKey });
        const deferredRetryAt = Date.now() + 60_000;
        yield* Effect.promise(() =>
          runInDurableObject(actorBlockRepo, async (_instance, state) => {
            // Ordinary waitUntil work must remain deferred so this assertion
            // proves that forceRetryNow owns every bounded pass.
            state.storage.sql.exec(
              `UPDATE frontendSubscribers
               SET deliveryAttempts = 1,
                   nextRetryAt = ?,
                   lastDeliveryError = ?
               WHERE frontendRepoName = ?`,
              deferredRetryAt,
              'held for the forced finite drain',
              frontendRepoName,
            );
            state.storage.sql.exec(`
              WITH RECURSIVE archivedActorBlocks(accountIndex) AS (
                SELECT 1
                UNION ALL
                SELECT accountIndex + 1
                FROM archivedActorBlocks
                WHERE accountIndex < 101
              )
              INSERT INTO actorBlocks (
                pushedBlockId,
                lastAccountCursor,
                accountIndex,
                executedCommands,
                failedCommands,
                appliedMutations,
                deltas
              )
              SELECT
                NULL,
                'acur_actor_block_finite_drain_' || printf('%03d', accountIndex),
                accountIndex,
                '[]',
                '[]',
                '[]',
                '{}'
              FROM archivedActorBlocks
            `);
            await state.storage.setAlarm(deferredRetryAt);
          }),
        );

        const forcedDrain = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getActorBlockRepo,
            repo: ActorBlockRepo,
            key: actorKey,
            fn: ({ db, storage }) =>
              managedRuntime.runPromise(
                drainFrontendSubscribers({
                  db,
                  forceRetryNow: true,
                  inspectionOnly: false,
                  storage,
                }).pipe(Effect.provide(AsyncLive)),
              ),
          }),
        );
        const drainedState = yield* Effect.promise(() =>
          runInDurableObject(actorBlockRepo, async (_instance, state) => ({
            subscriber: state.storage.sql
              .exec<{
                currentAccountCursor: string | null;
                currentAccountIndex: number | null;
                deliveryAttempts: number;
                nextRetryAt: number | null;
                lastDeliveryError: string | null;
              }>(
                `SELECT currentAccountCursor,
                        currentAccountIndex,
                        deliveryAttempts,
                        nextRetryAt,
                        lastDeliveryError
                 FROM frontendSubscribers
                 WHERE frontendRepoName = ?`,
                frontendRepoName,
              )
              .one(),
            alarm: await state.storage.getAlarm(),
          })),
        );

        expect(forcedDrain).toEqual({ pendingFrontendSubscriberCount: 0 });
        expect(drainedState.subscriber).toEqual({
          currentAccountCursor: 'acur_actor_block_finite_drain_101',
          currentAccountIndex: 101,
          deliveryAttempts: 0,
          nextRetryAt: null,
          lastDeliveryError: null,
        });
        expect(drainedState.alarm).toBeNull();
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'accepts exact duplicates and rejects typed cursor, index, cross-key, and mixed-batch conflicts atomically',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_actor_block_exact_duplicates',
          accountId: makeAccountId({ id: 'actor-block-exact-duplicates' }),
          accountName: main.accountName,
          actorId: prefixActorId('actor-block-exact-duplicates'),
          actorName: main.actorName,
        };
        const firstCursor = Schema.decodeUnknownSync(
          makeAbbreviationIdSchema(coreAbbreviations.accountCursor),
        )('acur_actor_block_exact_duplicate_1');
        const secondCursor = Schema.decodeUnknownSync(
          makeAbbreviationIdSchema(coreAbbreviations.accountCursor),
        )('acur_actor_block_exact_duplicate_2');
        const thirdCursor = Schema.decodeUnknownSync(
          makeAbbreviationIdSchema(coreAbbreviations.accountCursor),
        )('acur_actor_block_exact_duplicate_3');
        const firstBlock = {
          pushedBlockId: null,
          lastAccountCursor: firstCursor,
          accountIndex: 1,
          executedCommands: [],
          failedCommands: [],
          appliedMutations: [],
          deltas: {},
        };
        const secondBlock = {
          ...firstBlock,
          lastAccountCursor: secondCursor,
          accountIndex: 2,
        };
        const actorBlockRepo = yield* getActorBlockRepo({ key });

        yield* makeAsync(() =>
          actorBlockRepo.storeActorBlocks({
            blocks: [firstBlock, secondBlock],
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          actorBlockRepo.storeActorBlocks({ blocks: [firstBlock] }),
        ).pipe(Effect.flatMap(decodeRpc));

        const cursorConflict = yield* makeAsync(() =>
          actorBlockRepo.storeActorBlocks({
            blocks: [{ ...firstBlock, accountIndex: 3 }],
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        const indexConflict = yield* makeAsync(() =>
          actorBlockRepo.storeActorBlocks({
            blocks: [
              {
                ...firstBlock,
                lastAccountCursor: thirdCursor,
                accountIndex: 1,
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        const crossKeyConflict = yield* makeAsync(() =>
          actorBlockRepo.storeActorBlocks({
            blocks: [
              {
                ...firstBlock,
                lastAccountCursor: firstCursor,
                accountIndex: 2,
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        const mixedBatchConflict = yield* makeAsync(() =>
          actorBlockRepo.storeActorBlocks({
            blocks: [
              {
                ...firstBlock,
                lastAccountCursor: thirdCursor,
                accountIndex: 3,
              },
              {
                ...firstBlock,
                lastAccountCursor: firstCursor,
                accountIndex: 4,
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);

        expect(cursorConflict._tag).toBe('Left');
        if (cursorConflict._tag === 'Left') {
          expect(cursorConflict.left.code).toBe(
            'actor-block-conflicting-duplicate',
          );
          expect(cursorConflict.left.extra).toMatchObject({
            lastAccountCursor: firstCursor,
            accountIndex: 3,
          });
        }
        expect(indexConflict._tag).toBe('Left');
        if (indexConflict._tag === 'Left') {
          expect(indexConflict.left.code).toBe(
            'actor-block-conflicting-duplicate',
          );
          expect(indexConflict.left.extra).toMatchObject({
            lastAccountCursor: thirdCursor,
            accountIndex: 1,
          });
        }
        expect(crossKeyConflict._tag).toBe('Left');
        if (crossKeyConflict._tag === 'Left') {
          expect(crossKeyConflict.left.code).toBe(
            'actor-block-conflicting-duplicate',
          );
          expect(crossKeyConflict.left.extra).toMatchObject({
            lastAccountCursor: firstCursor,
            accountIndex: 2,
          });
        }
        expect(mixedBatchConflict._tag).toBe('Left');
        if (mixedBatchConflict._tag === 'Left') {
          expect(mixedBatchConflict.left.code).toBe(
            'actor-block-conflicting-duplicate',
          );
          expect(mixedBatchConflict.left.extra).toMatchObject({
            lastAccountCursor: firstCursor,
            accountIndex: 4,
          });
        }

        const retainedRows = yield* Effect.promise(() =>
          runInDurableObject(actorBlockRepo, (_instance, state) =>
            state.storage.sql
              .exec<{
                lastAccountCursor: string;
                accountIndex: number;
              }>(
                `SELECT lastAccountCursor, accountIndex
                 FROM actorBlocks
                 ORDER BY accountIndex`,
              )
              .toArray(),
          ),
        );
        expect(retainedRows).toEqual([
          { lastAccountCursor: firstCursor, accountIndex: 1 },
          { lastAccountCursor: secondCursor, accountIndex: 2 },
        ]);
        expect(retainedRows).not.toContainEqual({
          lastAccountCursor: thirdCursor,
          accountIndex: 3,
        });
      }).pipe(Effect.provide(AsyncLive)),
  );
});
