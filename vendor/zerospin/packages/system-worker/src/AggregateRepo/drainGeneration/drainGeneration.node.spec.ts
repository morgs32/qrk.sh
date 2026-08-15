import { it } from '@effect/vitest';
import type { IDb } from '@zerospin/core/drizzle/types';
import { Effect, Either } from 'effect';
import { describe, expect, vi } from 'vitest';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';

import { drainGeneration } from './drainGeneration.js';

const { drainAggregateOutboxesMock } = vi.hoisted(() => ({
  drainAggregateOutboxesMock: vi.fn(() => Effect.void),
}));

vi.mock('../drainAggregateOutboxes/drainAggregateOutboxes.js', () => ({
  drainAggregateOutboxes: drainAggregateOutboxesMock,
}));
vi.mock('../AggregateRepo.js', () => ({
  aggregateRepoDrizzleSchemas: {
    aggregateBlockOutbox: { aggregateIndex: {} },
    serviceSubscriptions: {
      failure: {},
      serviceRepoName: {},
      subscribedAt: {},
    },
  },
}));
vi.mock('drizzle-orm', () => ({
  isNotNull: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
}));

describe('AggregateRepo.drainGeneration', () => {
  it.effect(
    'always drains aggregate outboxes before returning zero pending work',
    () =>
      Effect.gen(function* () {
        drainAggregateOutboxesMock.mockClear();
        const all = vi.fn().mockReturnValueOnce([]).mockReturnValueOnce([]);
        const db = {
          select: vi.fn(() => ({
            from: vi.fn(() => ({ where: vi.fn(() => ({ all })) })),
          })),
        } as unknown as IDb;

        const result = yield* drainGeneration({
          aggregateId: 'acct_test',
          aggregateName: 'account',
          aggregateRepoName: 'aggrepo_test',
          db,
          deliveryQueue: {} as ReturnType<typeof makeDeliveryQueue>,
          generationId: 'gen_test',
          storage: {} as DurableObjectStorage,
        });

        expect(drainAggregateOutboxesMock).toHaveBeenCalledOnce();
        expect(result).toEqual({
          pendingServiceSubscriptionCount: 0,
          pendingAggregateBlockCount: 0,
        });
      }),
  );

  it.effect('reports ordinary incomplete drain after attempting delivery', () =>
    Effect.gen(function* () {
      drainAggregateOutboxesMock.mockClear();
      const all = vi.fn().mockReturnValueOnce([{}]).mockReturnValueOnce([]);
      const db = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({ where: vi.fn(() => ({ all })) })),
        })),
      } as unknown as IDb;

      const result = yield* drainGeneration({
        aggregateId: 'acct_test',
        aggregateName: 'account',
        aggregateRepoName: 'aggrepo_test',
        db,
        deliveryQueue: {} as ReturnType<typeof makeDeliveryQueue>,
        generationId: 'gen_test',
        storage: {} as DurableObjectStorage,
      }).pipe(Effect.either);

      expect(drainAggregateOutboxesMock).toHaveBeenCalledOnce();
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe('aggregate-generation-drain-incomplete');
      }
    }),
  );
});
