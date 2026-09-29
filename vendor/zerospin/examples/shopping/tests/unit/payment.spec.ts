import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makePurchasePaymentMachine, PaymentProvider } from '@zerospin/purchase/server';
import { Effect, Exit, Fiber, Schema } from 'effect';
import * as TestClock from 'effect/testing/TestClock';
import { expect } from 'vitest';

import { makeActorSnapshotDb } from '../../../../packages/system-worker/src/AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb';
import { ClerkUserIdSchema } from '../../src/zerospin/aggregates/shopper/models/user/UserV1';
import { purchase as purchaseModule } from '../../src/zerospin/aggregates/shopper/purchase';
import { shopperAggregateV2 } from '../../src/zerospin/aggregates/shopper/shopperAggregateV2';
import { PaymentProviderLive } from '../../src/zerospin/PaymentProviderLive';
const recordIntentObservation =
  purchaseModule.contracts.recordPaymentObservation;

it.effect(
  'keeps the accepted payment identifiers through the provider delay',
  () => Effect.gen(function* () {
    const pay = yield* PaymentProvider;
    let completed = false;
    const fiber = yield* pay({
      paymentIntentId: 'pmt_1',
      purchaseId: 'pur_1',
      quote: {
        currency: 'usd',
        items: [],
        subtotalAmount: 100,
        discountAmount: 0,
        promotionReservationId: null,
        totalAmount: 100,
      },
    }).pipe(
      Effect.tap(() => Effect.sync(() => { completed = true; })),
      Effect.forkChild,
    );
    yield* TestClock.adjust('4999 millis');
    expect(completed).toBe(false);
    yield* TestClock.adjust('1 millis');
    expect(yield* Fiber.join(fiber)).toMatchObject({
      outcome: 'succeeded', providerReference: 'mock_pmt_1',
    });
  }).pipe(Effect.provide(PaymentProviderLive)),
);

it.effect(
  'rejects a stale or cross-customer payment completion at authoritative commit',
  () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({
        models: shopperAggregateV2.models,
      });
      const scratch = yield* makeActorSnapshotDb(dbConfig);
      const now = new Date(0);
      const checkout: typeof dbConfig.schema.checkout.$inferInsert = {
        id: 'chk_1',
        modelName: 'checkout',
        version: '1.0.0',
        createdAt: now,
        updatedAt: now,
        cartId: 'crt_1',
        userId: 'usr_1',
        promotionReservationId: null,
        purchaseId: 'pur_1',
        firstPaymentIntentId: 'pmt_1',
        quote: null,
        status: 'paying',
        failure: null,
      };
      const purchase: typeof dbConfig.schema.purchase.$inferInsert = {
        id: 'pur_1',
        modelName: 'purchase',
        version: '1.0.0',
        createdAt: now,
        updatedAt: now,
        cartId: 'crt_1',
        currency: 'usd',
        subtotalAmount: 100,
        discountAmount: 0,
        promotionReservationId: null,
        totalAmount: 100,
        status: 'unpaid',
      };
      const intent: typeof dbConfig.schema.paymentIntent.$inferInsert = {
        id: 'pmt_1',
        modelName: 'paymentIntent',
        version: '1.0.0',
        createdAt: now,
        updatedAt: now,
        purchaseId: 'pur_1',
        status: 'pending',
        providerReference: null,
        failure: null,
      };
      scratch.db
        .insert(dbConfig.schema.user)
        .values({
          id: 'usr_1',
          modelName: 'user',
          version: '1.0.0',
          createdAt: now,
          updatedAt: now,
          clerkUserId: 'user_1',
          name: null,
        })
        .run();
      scratch.db
        .insert(dbConfig.schema.cart)
        .values({
          id: 'crt_1',
          modelName: 'cart',
          version: '1.0.0',
          createdAt: now,
          updatedAt: now,
          userId: 'usr_1',
        })
        .run();
      scratch.db.insert(dbConfig.schema.checkout).values(checkout).run();
      scratch.db.insert(dbConfig.schema.purchase).values(purchase).run();
      scratch.db.insert(dbConfig.schema.paymentIntent).values(intent).run();
      const guard = recordIntentObservation.guard;
      const input: Parameters<NonNullable<typeof guard>>[0] = {
        db: scratch.db,
        claims: {
          clerkUserId: Schema.decodeUnknownSync(ClerkUserIdSchema)('user_1'),
        },
        failures: recordIntentObservation.failures,
        payload: {
          checkoutId: 'chk_1',
          purchaseId: 'pur_1',
          paymentIntentId: 'pmt_1',
          expected: 'pending',
          outcome: 'succeeded',
          providerReference: 'mock_pmt_1',
          cartItemIds: [],
        },
      };
      expect(Exit.isSuccess(yield* Effect.exit(guard!(input)))).toBe(true);
      expect(
        Exit.isFailure(
          yield* Effect.exit(
            guard!({
              ...input,
              claims: {
                clerkUserId:
                  Schema.decodeUnknownSync(ClerkUserIdSchema)('user_other'),
              },
            }),
          ),
        ),
      ).toBe(true);
      scratch.db
        .update(dbConfig.schema.paymentIntent)
        .set({ status: 'succeeded' })
        .run();
      expect(Exit.isFailure(yield* Effect.exit(guard!(input)))).toBe(true);
    }).pipe(Effect.provide(AsyncLive), Effect.provide(PaymentProviderLive)),
);

it('binds the payment machine to the final shopper contract', () => {
  const machine = makePurchasePaymentMachine({
    source: shopperAggregateV2,
    claimsForUser: () => ({ clerkUserId: 'user_1' }),
  });
  expect(machine.source).toBe(shopperAggregateV2);
  expect(machine.contracts.recordPaymentObservation.contract)
    .toBe(shopperAggregateV2.contracts.recordPaymentObservation);
});
