import { it } from '@effect/vitest';
import type { IDb } from '@zerospin/core/drizzle/types';
import { Effect, Either } from 'effect';
import { describe, expect, vi } from 'vitest';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';

import { drainGeneration } from './drainGeneration.js';

const { drainServiceFrontendBlockOutboxMock } = vi.hoisted(() => ({
  drainServiceFrontendBlockOutboxMock: vi.fn(() => Effect.void),
}));

vi.mock(
  '../drainServiceFrontendBlockOutbox/drainServiceFrontendBlockOutbox.js',
  () => ({
    drainServiceFrontendBlockOutbox: drainServiceFrontendBlockOutboxMock,
  }),
);
vi.mock('../ServiceFrontendRepo.js', () => ({
  serviceFrontendRepoDrizzleSchemas: {
    serviceFrontendBlockOutbox: {
      failure: {},
      frontendIndex: {},
      publishedAt: {},
    },
  },
}));
vi.mock('drizzle-orm', () => ({
  isNotNull: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
}));

describe('ServiceFrontendRepo.drainGeneration', () => {
  it.effect(
    'always drains the archive outbox before returning zero pending work',
    () =>
      Effect.gen(function* () {
        drainServiceFrontendBlockOutboxMock.mockClear();
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
          key: {
            generationId: 'gen_test',
            serviceName: 'lists',
            userId: 'user_test',
            frontendName: 'main',
          },
          storage: {} as DurableObjectStorage,
        });

        expect(drainServiceFrontendBlockOutboxMock).toHaveBeenCalledOnce();
        expect(result).toEqual({ pendingServiceFrontendBlockCount: 0 });
      }),
  );

  it.effect('reports ordinary incomplete drain after attempting delivery', () =>
    Effect.gen(function* () {
      drainServiceFrontendBlockOutboxMock.mockClear();
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
        key: {
          generationId: 'gen_test',
          serviceName: 'lists',
          userId: 'user_test',
          frontendName: 'main',
        },
        storage: {} as DurableObjectStorage,
      }).pipe(Effect.either);

      expect(drainServiceFrontendBlockOutboxMock).toHaveBeenCalledOnce();
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe(
          'service-frontend-generation-drain-incomplete',
        );
      }
    }),
  );
});
