/*
 * System-worker annotation:
 * Exercises AccountBlockRepo.refreshQueue durable work discovery.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemorySqljsDb } from '@zerospin/core/drizzle/makeMigratedInMemorySqljsDb';
import type { IAccountCursor } from '@zerospin/core/models/types';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect, vi } from 'vitest';

import {
  accountBlockDrizzleSchemas,
  accountBlockTables,
} from '../accountBlockDrizzleSchemas.js';

import { refreshQueue } from './refreshQueue.js';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {},
  WorkerEntrypoint: class {},
  env: {},
}));

const dbConfig = makeDbConfig({
  tables: accountBlockTables,
});

describe('AccountBlockRepo.refreshQueue', () => {
  it.effect(
    'returns lagging subscribers oldest first with per-subscriber block suffixes',
    () =>
      Effect.gen(function* () {
        const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

        db.insert(accountBlockDrizzleSchemas.finalizedBlocks)
          .values({
            lastAccountCursor: 'acur_001' as IAccountCursor,
            accountIndex: 1,
            executedCommands: '[]',
            failedCommands: '[]',
            appliedMutations: '[]',
          })
          .run();
        db.insert(accountBlockDrizzleSchemas.finalizedBlocks)
          .values({
            lastAccountCursor: 'acur_002' as IAccountCursor,
            accountIndex: 2,
            executedCommands: '[]',
            failedCommands: '[]',
            appliedMutations: '[]',
          })
          .run();
        db.insert(accountBlockDrizzleSchemas.finalizedBlocks)
          .values({
            lastAccountCursor: 'acur_003' as IAccountCursor,
            accountIndex: 3,
            executedCommands: '[]',
            failedCommands: '[]',
            appliedMutations: '[]',
          })
          .run();

        db.insert(accountBlockDrizzleSchemas.actorSubscribers)
          .values({
            actorRepoName: 'actrrepo_sub_newer',
            accountId: 'acct_refresh',
            accountName: 'main',
            actorId: 'actr_newer',
            actorName: 'actor',
            currentAccountCursor: 'acur_002' as IAccountCursor,
            currentAccountIndex: 2,
            queuedAccountCursor: 'acur_002' as IAccountCursor,
            queuedAccountIndex: 2,
            deliveryAttempts: 0,
            nextRetryAt: null,
            lastDeliveryError: null,
            failedAt: null,
            succeededAt: 1,
          })
          .run();
        db.insert(accountBlockDrizzleSchemas.actorSubscribers)
          .values({
            actorRepoName: 'actrrepo_sub_middle',
            accountId: 'acct_refresh',
            accountName: 'main',
            actorId: 'actr_middle',
            actorName: 'actor',
            currentAccountCursor: 'acur_001' as IAccountCursor,
            currentAccountIndex: 1,
            queuedAccountCursor: 'acur_001' as IAccountCursor,
            queuedAccountIndex: 1,
            deliveryAttempts: 0,
            nextRetryAt: null,
            lastDeliveryError: null,
            failedAt: null,
            succeededAt: 1,
          })
          .run();
        db.insert(accountBlockDrizzleSchemas.actorSubscribers)
          .values({
            actorRepoName: 'actrrepo_sub_oldest',
            accountId: 'acct_refresh',
            accountName: 'main',
            actorId: 'actr_oldest',
            actorName: 'actor',
            currentAccountCursor: null,
            currentAccountIndex: null,
            queuedAccountCursor: null,
            queuedAccountIndex: null,
            deliveryAttempts: 0,
            nextRetryAt: null,
            lastDeliveryError: null,
            failedAt: null,
            succeededAt: 1,
          })
          .run();

        const subscriberDeliveries = yield* refreshQueue({
          db,
          deliveryBatchSize: 10,
        });

        expect(
          subscriberDeliveries.map(row => row.subscriber.actorRepoName),
        ).toEqual([
          'actrrepo_sub_oldest',
          'actrrepo_sub_middle',
          'actrrepo_sub_newer',
        ]);
        expect(
          subscriberDeliveries[0]?.blocks.map(block => block.accountIndex),
        ).toEqual([1, 2, 3]);
        expect(
          subscriberDeliveries[1]?.blocks.map(block => block.accountIndex),
        ).toEqual([2, 3]);
        expect(
          subscriberDeliveries[2]?.blocks.map(block => block.accountIndex),
        ).toEqual([3]);
        expect(subscriberDeliveries[0]?.blocks[1]).toBe(
          subscriberDeliveries[1]?.blocks[0],
        );
        expect(subscriberDeliveries[0]?.blocks[2]).toBe(
          subscriberDeliveries[2]?.blocks[0],
        );
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'keeps returned suffixes stable when later blocks are picked up by a later refresh',
    () =>
      Effect.gen(function* () {
        const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

        db.insert(accountBlockDrizzleSchemas.finalizedBlocks)
          .values({
            lastAccountCursor: 'acur_011' as IAccountCursor,
            accountIndex: 11,
            executedCommands: '[]',
            failedCommands: '[]',
            appliedMutations: '[]',
          })
          .run();
        db.insert(accountBlockDrizzleSchemas.actorSubscribers)
          .values({
            actorRepoName: 'actrrepo_sub_active',
            accountId: 'acct_refresh_stable',
            accountName: 'main',
            actorId: 'actr_active',
            actorName: 'actor',
            currentAccountCursor: null,
            currentAccountIndex: null,
            queuedAccountCursor: null,
            queuedAccountIndex: null,
            deliveryAttempts: 0,
            nextRetryAt: null,
            lastDeliveryError: null,
            failedAt: null,
            succeededAt: 1,
          })
          .run();

        const firstDeliveries = yield* refreshQueue({
          db,
          deliveryBatchSize: 10,
        });
        const firstDelivery = firstDeliveries[0];

        db.insert(accountBlockDrizzleSchemas.finalizedBlocks)
          .values({
            lastAccountCursor: 'acur_012' as IAccountCursor,
            accountIndex: 12,
            executedCommands: '[]',
            failedCommands: '[]',
            appliedMutations: '[]',
          })
          .run();
        db.update(accountBlockDrizzleSchemas.actorSubscribers)
          .set({
            currentAccountCursor: 'acur_011' as IAccountCursor,
            currentAccountIndex: 11,
            queuedAccountCursor: 'acur_011' as IAccountCursor,
            queuedAccountIndex: 11,
          })
          .where(
            eq(
              accountBlockDrizzleSchemas.actorSubscribers.actorRepoName,
              'actrrepo_sub_active',
            ),
          )
          .run();

        const secondDeliveries = yield* refreshQueue({
          db,
          deliveryBatchSize: 10,
        });

        expect(firstDelivery?.blocks.map(block => block.accountIndex)).toEqual([
          11,
        ]);
        expect(
          secondDeliveries[0]?.blocks.map(block => block.accountIndex),
        ).toEqual([12]);
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('skips subscribers whose retry time is still in the future', () =>
    Effect.gen(function* () {
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

      db.insert(accountBlockDrizzleSchemas.finalizedBlocks)
        .values({
          lastAccountCursor: 'acur_021' as IAccountCursor,
          accountIndex: 21,
          executedCommands: '[]',
          failedCommands: '[]',
          appliedMutations: '[]',
        })
        .run();
      db.insert(accountBlockDrizzleSchemas.actorSubscribers)
        .values({
          actorRepoName: 'actrrepo_sub_due',
          accountId: 'acct_refresh_retry',
          accountName: 'main',
          actorId: 'actr_due',
          actorName: 'actor',
          currentAccountCursor: null,
          currentAccountIndex: null,
          queuedAccountCursor: null,
          queuedAccountIndex: null,
          deliveryAttempts: 0,
          nextRetryAt: null,
          lastDeliveryError: null,
          failedAt: null,
          succeededAt: 1,
        })
        .run();
      db.insert(accountBlockDrizzleSchemas.actorSubscribers)
        .values({
          actorRepoName: 'actrrepo_sub_future',
          accountId: 'acct_refresh_retry',
          accountName: 'main',
          actorId: 'actr_future',
          actorName: 'actor',
          currentAccountCursor: null,
          currentAccountIndex: null,
          queuedAccountCursor: null,
          queuedAccountIndex: null,
          deliveryAttempts: 1,
          nextRetryAt: Date.now() + 60_000,
          lastDeliveryError: 'wait',
          failedAt: Date.now(),
          succeededAt: null,
        })
        .run();

      const subscriberDeliveries = yield* refreshQueue({
        db,
        deliveryBatchSize: 10,
      });

      expect(
        subscriberDeliveries.map(row => row.subscriber.actorRepoName),
      ).toEqual(['actrrepo_sub_due']);
    }).pipe(Effect.provide(AsyncLive)),
  );
});
