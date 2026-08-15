import { it } from '@effect/vitest';
import type { IDb } from '@zerospin/core/drizzle/types';
import { Effect, Either } from 'effect';
import { describe, expect, vi } from 'vitest';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';

import { drainGeneration } from './drainGeneration.js';

const { drainAggregateFrontendBlockOutboxMock, drainPushBlockOutboxMock } =
  vi.hoisted(() => ({
    drainAggregateFrontendBlockOutboxMock: vi.fn(() => Effect.void),
    drainPushBlockOutboxMock: vi.fn(() => Effect.void),
  }));

vi.mock(
  '../drainAggregateFrontendBlockOutbox/drainAggregateFrontendBlockOutbox.js',
  () => ({
    drainAggregateFrontendBlockOutbox: drainAggregateFrontendBlockOutboxMock,
  }),
);
vi.mock('../drainPushBlockOutbox/drainPushBlockOutbox.js', () => ({
  drainPushBlockOutbox: drainPushBlockOutboxMock,
}));
vi.mock('../AggregateFrontendRepo.js', () => ({
  aggregateFrontendRepoDrizzleSchemas: {
    aggregateFrontendBlockOutbox: {
      failure: {},
      frontendIndex: {},
      publishedAt: {},
    },
    pushBlockOutbox: { failure: {}, finalizedAt: {}, writeIndex: {} },
  },
}));
vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal()),
  isNotNull: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
}));

describe('AggregateFrontendRepo.drainGeneration', () => {
  it.effect(
    'always drains command and archive outboxes before returning zero pending work',
    () =>
      Effect.gen(function* () {
        drainPushBlockOutboxMock.mockClear();
        drainAggregateFrontendBlockOutboxMock.mockClear();
        const all = vi.fn().mockReturnValueOnce([]).mockReturnValueOnce([]);
        const db = {
          select: vi.fn(() => ({
            from: vi.fn(() => ({ where: vi.fn(() => ({ all })) })),
          })),
        } as unknown as IDb;

        const result = yield* drainGeneration({
          configuredSystemId: 'sys_test',
          db,
          deliveryQueue: {} as ReturnType<typeof makeDeliveryQueue>,
          key: {
            generationId: 'gen_test',
            aggregateId: 'acct_test',
            aggregateName: 'account',
            userId: 'user_test',
            frontendName: 'main',
          },
          storage: {} as DurableObjectStorage,
        });

        expect(drainPushBlockOutboxMock).toHaveBeenCalledOnce();
        expect(drainAggregateFrontendBlockOutboxMock).toHaveBeenCalledOnce();
        expect(result).toEqual({
          pendingPushBlockCount: 0,
          pendingFrontendBlockCount: 0,
        });
      }),
  );

  it.effect('reports ordinary incomplete drain after attempting delivery', () =>
    Effect.gen(function* () {
      drainPushBlockOutboxMock.mockClear();
      drainAggregateFrontendBlockOutboxMock.mockClear();
      const all = vi.fn().mockReturnValueOnce([]).mockReturnValueOnce([{}]);
      const db = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({ where: vi.fn(() => ({ all })) })),
        })),
      } as unknown as IDb;

      const result = yield* drainGeneration({
        configuredSystemId: 'sys_test',
        db,
        deliveryQueue: {} as ReturnType<typeof makeDeliveryQueue>,
        key: {
          generationId: 'gen_test',
          aggregateId: 'acct_test',
          aggregateName: 'account',
          userId: 'user_test',
          frontendName: 'main',
        },
        storage: {} as DurableObjectStorage,
      }).pipe(Effect.either);

      expect(drainPushBlockOutboxMock).toHaveBeenCalledOnce();
      expect(drainAggregateFrontendBlockOutboxMock).toHaveBeenCalledOnce();
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe(
          'aggregate-frontend-generation-drain-incomplete',
        );
      }
    }),
  );
});
