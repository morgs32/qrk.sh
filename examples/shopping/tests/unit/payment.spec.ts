import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { Effect, Exit, Fiber, Schema } from 'effect';
import * as TestClock from 'effect/testing/TestClock';
import { expect } from 'vitest';

import { makeActorSnapshotDb } from '../../../../packages/system-worker/src/AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb';
import { ClerkUserIdSchema } from '../../src/zerospin/aggregates/shopper/models/user/UserV1';
import { purchase as purchaseModule } from '../../src/zerospin/aggregates/shopper/purchase';
import { shopperAggregateV2 } from '../../src/zerospin/aggregates/shopper/shopperAggregateV2';
import { shopperAggregateV3 } from '../../src/zerospin/aggregates/shopper/shopperAggregateV3';
import { PaymentProviderLive } from '../../src/zerospin/PaymentProviderLive';
const processPayment = purchaseModule.automations.processPayment;
const recordIntentObservation =
  purchaseModule.contracts.recordPaymentObservation;

it.effect(
  'retains the accepted payment identifiers and waits five seconds before returning completion',
  () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({
        models: shopperAggregateV2.models,
      });
      const scratch = yield* makeActorSnapshotDb(dbConfig);
      let completed = false;
      const fiber = yield* processPayment
        .program({
          db: scratch.queryDb,
          on: {
            id: 'cmd_accepted',
            commandName: 'createAcceptedPurchase',
            contractVersion: '1.0.0',
            systemName: 'shopping',
            aggregateName: 'shopper',
            aggregateId: 'acct_1',
            aggregateVersion: '2.0.0',
            actorName: 'shopper',
            actorVersion: '2.0.0',
            claims: { clerkUserId: 'user_1' },
            nodeId: null,
            nodeIndex: null,
            sessionName: null,
            payload: {
              checkoutId: 'chk_1',
              id: 'pur_1',
              paymentIntentId: 'pmt_1',
              cartId: 'crt_1',
              expectedExisting: false,
              quote: {
                currency: 'usd',
                items: [
                  {
                    cartItemId: 'cit_1',
                    productId: 'prd_1',
                    name: 'Test',
                    quantity: 1,
                    unitAmount: 100,
                  },
                ],
                subtotalAmount: 100,
                discountAmount: 0,
                promotionReservationId: null,
                totalAmount: 100,
              },
            },
          },
          contracts: {
            recordPaymentObservation: payload => ({
              contract: recordIntentObservation,
              payload,
            }),
          },
        })
        .pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              completed = true;
            }),
          ),
          Effect.forkChild,
        );
      yield* TestClock.adjust('4999 millis');
      expect(completed).toBe(false);
      yield* TestClock.adjust('1 millis');
      const result = yield* Fiber.join(fiber);
      expect(result).toMatchObject({
        contract: recordIntentObservation,
        payload: {
          checkoutId: 'chk_1',
          purchaseId: 'pur_1',
          paymentIntentId: 'pmt_1',
          outcome: 'succeeded',
          expected: 'pending',
          providerReference: 'mock_pmt_1',
          cartItemIds: ['cit_1'],
        },
      });
      expect(shopperAggregateV2.actors.shopper.contracts).not.toHaveProperty(
        'recordPaymentObservation',
      );
      expect(shopperAggregateV2.automations.processPayment).toBe(
        processPayment,
      );
    }).pipe(Effect.provide(AsyncLive), Effect.provide(PaymentProviderLive)),
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
      const guard = shopperAggregateV2.guards.shopper!.recordPaymentObservation;
      const input: Parameters<NonNullable<typeof guard>>[0] = {
        queryDb: scratch.queryDb,
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

it('binds each supported shopper version to its final automation contracts', () => {
  for (const aggregate of [shopperAggregateV2, shopperAggregateV3]) {
    expect(aggregate.automations.acceptPurchase.on).toBe(
      aggregate.contracts.confirmCheckout,
    );
    expect(
      aggregate.automations.processPayment.contracts.recordPaymentObservation,
    ).toBe(aggregate.contracts.recordPaymentObservation);
  }
});
