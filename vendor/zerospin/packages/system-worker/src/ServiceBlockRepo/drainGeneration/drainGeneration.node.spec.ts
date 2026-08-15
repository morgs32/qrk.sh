import { it } from '@effect/vitest';
import type { IDb } from '@zerospin/core/drizzle/types';
import { Effect, Either } from 'effect';
import { describe, expect, vi } from 'vitest';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';

import { drainGeneration } from './drainGeneration.js';

const { drainAggregateSubscribersMock, drainServiceFrontendSubscribersMock } =
  vi.hoisted(() => ({
    drainAggregateSubscribersMock: vi.fn(() => Effect.void),
    drainServiceFrontendSubscribersMock: vi.fn(() => Effect.void),
  }));

vi.mock('../drainAggregateSubscribers/drainAggregateSubscribers.js', () => ({
  drainAggregateSubscribers: drainAggregateSubscribersMock,
}));
vi.mock(
  '../drainServiceFrontendSubscribers/drainServiceFrontendSubscribers.js',
  () => ({
    drainServiceFrontendSubscribers: drainServiceFrontendSubscribersMock,
  }),
);
vi.mock('../ServiceBlockRepo.js', () => ({
  serviceBlockDrizzleSchemas: {
    aggregateSubscribers: {
      aggregateRepoName: {},
      currentServiceIndex: {},
      lastDeliveryError: {},
    },
    serviceBlocks: { serviceIndex: {} },
    serviceFrontendSubscribers: {
      currentServiceIndex: {},
      lastDeliveryError: {},
      serviceFrontendRepoName: {},
      status: {},
    },
  },
}));
vi.mock('drizzle-orm', () => ({
  desc: vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  lt: vi.fn(() => ({})),
  ne: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
}));

describe('ServiceBlockRepo.drainGeneration', () => {
  it.effect(
    'always drains both subscriber sets before returning zero pending work',
    () =>
      Effect.gen(function* () {
        drainAggregateSubscribersMock.mockClear();
        drainServiceFrontendSubscribersMock.mockClear();
        const db = {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => ({ get: vi.fn(() => undefined) })),
              })),
              where: vi.fn(() => ({ all: vi.fn(() => []) })),
            })),
          })),
        } as unknown as IDb;
        const result = yield* drainGeneration({
          db,
          deliveryQueue: {} as ReturnType<typeof makeDeliveryQueue>,
          generationId: 'gen_test',
          serviceName: 'lists',
        });

        expect(drainAggregateSubscribersMock).toHaveBeenCalledOnce();
        expect(drainServiceFrontendSubscribersMock).toHaveBeenCalledOnce();
        expect(result).toEqual({
          pendingAggregateSubscriberCount: 0,
          pendingServiceFrontendSubscriberCount: 0,
        });
      }),
  );

  it.effect('reports ordinary incomplete drain after attempting delivery', () =>
    Effect.gen(function* () {
      drainAggregateSubscribersMock.mockClear();
      drainServiceFrontendSubscribersMock.mockClear();
      const all = vi.fn().mockReturnValueOnce([{}]).mockReturnValueOnce([]);
      const db = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({ get: vi.fn(() => undefined) })),
            })),
            where: vi.fn(() => ({ all })),
          })),
        })),
      } as unknown as IDb;
      const result = yield* drainGeneration({
        db,
        deliveryQueue: {} as ReturnType<typeof makeDeliveryQueue>,
        generationId: 'gen_test',
        serviceName: 'lists',
      }).pipe(Effect.either);

      expect(drainAggregateSubscribersMock).toHaveBeenCalledOnce();
      expect(drainServiceFrontendSubscribersMock).toHaveBeenCalledOnce();
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe(
          'service-block-generation-drain-incomplete',
        );
      }
    }),
  );
});
