import { it } from '@effect/vitest';
import type { IDb } from '@zerospin/core/drizzle/types';
import { Effect, Either } from 'effect';
import { describe, expect, vi } from 'vitest';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';

import { drainGeneration } from './drainGeneration.js';

const { drainServiceBlockOutboxMock } = vi.hoisted(() => ({
  drainServiceBlockOutboxMock: vi.fn(() => Effect.void),
}));

vi.mock('../drainServiceBlockOutbox/drainServiceBlockOutbox.js', () => ({
  drainServiceBlockOutbox: drainServiceBlockOutboxMock,
}));
vi.mock('../ServiceRepo.js', () => ({
  serviceRepoDrizzleSchemas: {
    serviceBlockOutbox: { failure: {}, publishedAt: {}, serviceIndex: {} },
  },
}));
vi.mock('drizzle-orm', () => ({
  isNotNull: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
}));

describe('ServiceRepo.drainGeneration', () => {
  it.effect(
    'always drains the service outbox before returning zero pending work',
    () =>
      Effect.gen(function* () {
        drainServiceBlockOutboxMock.mockClear();
        const db = {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({ all: vi.fn(() => []) })),
            })),
          })),
        } as unknown as IDb;

        const result = yield* drainGeneration({
          db,
          deliveryQueue: {} as ReturnType<typeof makeDeliveryQueue>,
          generationId: 'gen_test',
          serviceName: 'lists',
          storage: {} as DurableObjectStorage,
        });

        expect(drainServiceBlockOutboxMock).toHaveBeenCalledOnce();
        expect(result).toEqual({ pendingServiceBlockCount: 0 });
      }),
  );

  it.effect('reports ordinary incomplete drain after attempting delivery', () =>
    Effect.gen(function* () {
      drainServiceBlockOutboxMock.mockClear();
      const db = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({ all: vi.fn(() => [{}]) })),
          })),
        })),
      } as unknown as IDb;

      const result = yield* drainGeneration({
        db,
        deliveryQueue: {} as ReturnType<typeof makeDeliveryQueue>,
        generationId: 'gen_test',
        serviceName: 'lists',
        storage: {} as DurableObjectStorage,
      }).pipe(Effect.either);

      expect(drainServiceBlockOutboxMock).toHaveBeenCalledOnce();
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe('service-generation-drain-incomplete');
      }
    }),
  );
});
