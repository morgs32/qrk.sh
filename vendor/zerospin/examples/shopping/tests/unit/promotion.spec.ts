import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb';
import { Clock, Effect, Exit } from 'effect';
import { expect } from 'vitest';

import { PromotionDevelopment } from '../../src/zerospin/PromotionDevelopment';
import { commitPromotion } from '../../src/zerospin/services/promotion/CommitPromotionV1';
import {
  promotionCapacity,
  promotionId,
  promotionReservationV1,
} from '../../src/zerospin/services/promotion/models';
import { reservePromotion } from '../../src/zerospin/services/promotion/ReservePromotionV1';
it.effect(
  'the authoritative promotion service enforces capacity and expiry',
  () =>
    Effect.gen(function* () {
      const config = makeResourceDbConfig({
        models: { promotionReservation: promotionReservationV1 },
      });
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig: config });
      const now = yield* Clock.currentTimeMillis;
      for (let index = 0; index < promotionCapacity; index++) {
        db.insert(config.schema.promotionReservation)
          .values({
            id: `prv_${index}`,
            modelName: 'promotionReservation',
            promotionId,
            version: '1.0.0',
            createdAt: new Date(now),
            updatedAt: new Date(now),
            aggregateId: `acct_${index}`,
            cartId: `crt_${index}`,
            purchaseId: null,
            status: 'reserved',
            expiresAt: now + 10000,
          })
          .run();
      }
      const payload = {
        id: 'prv_new' as const,
        aggregateId: 'acct_new',
        cartId: 'crt_new',
        purchaseId: null,
        expected: null,
        available: true,
        expiresAt: now + 10000,
      };
      const reserve = (available: boolean) =>
        reservePromotion.guard!({
          queryDb: db,
          identity: null,
          failures: reservePromotion.failures,
          payload: { ...payload, available },
        });
      expect(Exit.isFailure(yield* Effect.exit(reserve(true)))).toBe(true);
      expect(Exit.isSuccess(yield* Effect.exit(reserve(false)))).toBe(true);
      db.update(config.schema.promotionReservation)
        .set({ expiresAt: now - 1 })
        .run();
      expect(Exit.isSuccess(yield* Effect.exit(reserve(true)))).toBe(true);
      expect(
        Exit.isFailure(
          yield* Effect.exit(
            commitPromotion.guard!({
              queryDb: db,
              identity: null,
              failures: commitPromotion.failures,
              payload: {
                id: 'prv_0',
                aggregateId: 'acct_0',
                cartId: 'crt_0',
                purchaseId: 'pur_0',
                expected: { status: 'reserved', purchaseId: null },
              },
            }),
          ),
        ),
      ).toBe(true);
    }).pipe(
      Effect.provide(AsyncLive),
      Effect.provideService(PromotionDevelopment, Effect.void),
    ),
);
