import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { applyAggregateMutationTx } from '@zerospin/core/contracts/applyAggregateMutationTx';
import type { IMutations } from '@zerospin/core/contracts/make/makeContractVersion';
import type { IContract } from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb';
import type { IAnyModels } from '@zerospin/core/models/types';
import { makeZerospinError } from '@zerospin/error';
import type { IAnyShape } from '@zerospin/schema';
import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { purchaseFrontend, purchaseHost } from './browserConsumer.typecheck.js';
import { purchase } from './consumer.typecheck.js';
import { PromotionProvider } from './providers.js';
import { makePurchaseQuote } from './quote.js';

const identity = { aggregateId: 'acct_test', userId: 'usr_test' };
const quote = makePurchaseQuote([
  {
    id: 'cit_test',
    amount: 2,
    product: { id: 'prd_test', name: 'Test', price: 3 },
  },
]);
const confirm = {
  userId: 'usr_test',
  id: 'chk_test',
  cartId: 'crt_test',
  purchaseId: 'pur_test',
  paymentIntentId: 'pmt_test',
  expected: null,
  quote,
};
const accepted = {
  checkoutId: 'chk_test',
  id: 'pur_test',
  cartId: 'crt_test',
  paymentIntentId: 'pmt_test',
  expectedExisting: false,
  quote,
};
const observed = {
  checkoutId: 'chk_test',
  purchaseId: 'pur_test',
  paymentIntentId: 'pmt_test',
  expected: 'pending',
  outcome: 'succeeded',
  providerReference: 'provider_test',
  cartItemIds: ['cit_test'],
};
type Contract = IContract<
  string,
  IAnyShape,
  string,
  IMutations,
  Record<string, IAnyShape>,
  IAnyModels,
  never
>;
async function fixture() {
  const config = makeResourceDbConfig({
    models: { ...purchaseHost, ...purchase.models },
  });
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: config }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  const now = new Date();
  const base = { version: '1.0.0', createdAt: now, updatedAt: now };
  db.insert(config.schema.user)
    .values({ ...base, id: 'usr_test', modelName: 'user', name: 'Test' })
    .run();
  db.insert(config.schema.cart)
    .values({ ...base, id: 'crt_test', modelName: 'cart', userId: 'usr_test' })
    .run();
  db.insert(config.schema.product)
    .values({
      ...base,
      id: 'prd_test',
      modelName: 'product',
      deletedAt: null,
      name: 'Test',
      price: 3,
    })
    .run();
  db.insert(config.schema.cartItem)
    .values({
      ...base,
      id: 'cit_test',
      modelName: 'cartItem',
      cartId: 'crt_test',
      productId: 'prd_test',
      amount: 2,
    })
    .run();
  let sequence = 0;
  const execute = async (
    contract: Contract,
    payload: Record<string, unknown>,
    owner = identity,
  ) => {
    if (contract.guard) {
      await Effect.runPromise(
        contract.guard({
          queryDb: db,
          identity: owner,
          payload,
          failures: contract.failures,
        }),
      );
    }
    const mutations = await Effect.runPromise(
      contract.program({ identity: owner, payload }),
    );
    db.transaction(tx =>
      Effect.runSync(
        Effect.forEach(mutations, (mutation, mutationIndex) =>
          applyAggregateMutationTx({
            tx,
            mutation,
            mutationIndex,
            commandId: `cmd_${++sequence}`,
            appliedAt: new Date(),
          }),
        ),
      ),
    );
  };
  return { db, config, execute };
}

it('creates one purchase obligation, retains failed attempts, and clears the cart only on success', async () => {
  const { db, execute } = await fixture();
  try {
    await expect(
      execute(purchase.contracts.confirmCheckout, {
        ...confirm,
        userId: 'usr_other',
      }),
    ).rejects.toThrow();
    await expect(
      execute(purchase.contracts.confirmCheckout, {
        ...confirm,
        quote: { ...quote, totalAmount: 1 },
      }),
    ).rejects.toThrow();
    await execute(purchase.contracts.confirmCheckout, confirm);
    await execute(purchase.contracts.createAcceptedPurchase, accepted);
    await execute(purchase.contracts.recordPaymentObservation, {
      ...observed,
      outcome: 'declined',
    });
    expect(db.query.purchase.findFirst().sync()?.status).toBe('unpaid');
    expect(db.query.cartItem.findMany().sync()).toHaveLength(1);
    await execute(purchase.contracts.initiatePayment, {
      checkoutId: 'chk_test',
      id: 'pmt_retry',
      purchaseId: 'pur_test',
      expectedExisting: false,
    });
    await expect(
      execute(purchase.contracts.recordPaymentObservation, {
        ...observed,
        outcome: 'succeeded',
      }),
    ).rejects.toThrow();
    await execute(purchase.contracts.recordPaymentObservation, {
      ...observed,
      paymentIntentId: 'pmt_retry',
    });
    expect(db.query.purchase.findMany().sync()).toHaveLength(1);
    expect(db.query.purchase.findFirst().sync()?.status).toBe('paid');
    expect(
      db.query.paymentIntent
        .findMany()
        .sync()
        .map(row => row.status),
    ).toEqual(['declined', 'succeeded']);
    expect(db.query.cartItem.findMany().sync()).toHaveLength(0);
    expect(db.query.purchaseItem.findFirst().sync()).toMatchObject({
      quantity: 2,
      unitAmount: 300,
    });
  } finally {
    if (
      '$client' in db &&
      db.$client instanceof Object &&
      'close' in db.$client &&
      typeof db.$client.close === 'function'
    ) {
      db.$client.close();
    }
  }
});

it('blocks retry and cancellation while a payment remains uncertain', async () => {
  const { db, execute } = await fixture();
  try {
    await execute(purchase.contracts.confirmCheckout, confirm);
    await execute(purchase.contracts.createAcceptedPurchase, accepted);
    await execute(purchase.contracts.recordPaymentObservation, {
      ...observed,
      outcome: 'uncertain',
    });
    await expect(
      execute(purchase.contracts.initiatePayment, {
        checkoutId: 'chk_test',
        id: 'pmt_retry',
        purchaseId: 'pur_test',
        expectedExisting: false,
      }),
    ).rejects.toThrow();
    await expect(
      execute(purchase.contracts.cancelPurchase, {
        checkoutId: 'chk_test',
        purchaseId: 'pur_test',
      }),
    ).rejects.toThrow();
    await execute(purchase.contracts.recordPaymentObservation, {
      ...observed,
      expected: 'uncertain',
    });
    expect(db.query.purchase.findFirst().sync()?.status).toBe('paid');
  } finally {
    if (
      '$client' in db &&
      db.$client instanceof Object &&
      'close' in db.$client &&
      typeof db.$client.close === 'function'
    ) {
      db.$client.close();
    }
  }
});

it('requires a committed promotion before purchase creation and records redemption', async () => {
  const { db, execute } = await fixture();
  try {
    await execute(purchase.contracts.applyPromotion, {
      userId: 'usr_test',
      checkoutId: 'chk_test',
      cartId: 'crt_test',
      id: 'prv_test',
      expected: null,
    });
    await execute(purchase.contracts.recordPromotion, {
      checkoutId: 'chk_test',
      id: 'prv_test',
      status: 'reserved',
      expiresAt: Date.now() + 60000,
      purchaseId: null,
      finalizeRemoval: false,
    });
    const promotedQuote = {
      ...quote,
      promotionReservationId: 'prv_test',
      discountAmount: 300,
      totalAmount: 300,
    };
    await execute(purchase.contracts.confirmCheckout, {
      ...confirm,
      expected: 'promotion',
      quote: promotedQuote,
    });
    await expect(
      execute(purchase.contracts.createAcceptedPurchase, {
        ...accepted,
        quote: promotedQuote,
      }),
    ).rejects.toThrow();
    await execute(purchase.contracts.recordPromotion, {
      checkoutId: 'chk_test',
      id: 'prv_test',
      status: 'committed',
      expiresAt: Date.now() + 60000,
      purchaseId: 'pur_test',
      finalizeRemoval: false,
    });
    await execute(purchase.contracts.createAcceptedPurchase, {
      ...accepted,
      quote: promotedQuote,
    });
    await execute(purchase.contracts.recordPaymentObservation, observed);
    await execute(purchase.contracts.recordPromotion, {
      checkoutId: 'chk_test',
      id: 'prv_test',
      status: 'redeemed',
      expiresAt: null,
      purchaseId: 'pur_test',
      finalizeRemoval: false,
    });
    expect(db.query.cartPromotion.findFirst().sync()?.status).toBe('redeemed');
    expect(db.query.purchase.findFirst().sync()?.totalAmount).toBe(300);
  } finally {
    if (
      '$client' in db &&
      db.$client instanceof Object &&
      'close' in db.$client &&
      typeof db.$client.close === 'function'
    ) {
      db.$client.close();
    }
  }
});

it('keeps canonical frontend declarations and final automation contract references', () => {
  expect(purchase.models).toBe(purchaseFrontend.models);
  for (const [name, contract] of Object.entries(purchaseFrontend.contracts)) {
    expect(purchase.contracts).toHaveProperty(name, contract);
  }
  for (const automation of Object.values(purchase.automations)) {
    expect(
      Object.values(purchase.contracts).some(
        contract => contract === automation.on,
      ),
    ).toBe(automation.name !== 'releaseCartPromotions');
    for (const contract of Object.values(automation.contracts)) {
      expect(Object.values(purchase.contracts)).toContain(contract);
    }
  }
});

it('cancels a declined purchase while preserving the obligation, attempts and cart', async () => {
  const { db, execute } = await fixture();
  try {
    await execute(purchase.contracts.confirmCheckout, confirm);
    await execute(purchase.contracts.createAcceptedPurchase, accepted);
    await execute(purchase.contracts.recordPaymentObservation, {
      ...observed,
      outcome: 'declined',
    });
    await execute(purchase.contracts.cancelPurchase, {
      checkoutId: 'chk_test',
      purchaseId: 'pur_test',
    });
    expect(db.query.purchase.findFirst().sync()?.status).toBe('canceled');
    expect(db.query.paymentIntent.findFirst().sync()?.status).toBe('declined');
    expect(db.query.cartItem.findMany().sync()).toHaveLength(1);
    await expect(
      execute(purchase.contracts.initiatePayment, {
        checkoutId: 'chk_test',
        id: 'pmt_retry',
        purchaseId: 'pur_test',
        expectedExisting: false,
      }),
    ).rejects.toThrow();
  } finally {
    if (
      '$client' in db &&
      db.$client instanceof Object &&
      'close' in db.$client &&
      typeof db.$client.close === 'function'
    ) {
      db.$client.close();
    }
  }
});

it('rejects expired promotions and stale receipts after confirmed removal', async () => {
  const { db, execute } = await fixture();
  try {
    await execute(purchase.contracts.applyPromotion, {
      userId: 'usr_test',
      checkoutId: 'chk_test',
      cartId: 'crt_test',
      id: 'prv_test',
    });
    const receipt = {
      checkoutId: 'chk_test',
      id: 'prv_test',
      status: 'reserved',
      expiresAt: 0,
      purchaseId: null,
      finalizeRemoval: false,
    };
    await execute(purchase.contracts.recordPromotion, receipt);
    await expect(
      execute(purchase.contracts.confirmCheckout, {
        ...confirm,
        expected: 'promotion',
        quote: {
          ...quote,
          promotionReservationId: 'prv_test',
          discountAmount: 300,
          totalAmount: 300,
        },
      }),
    ).rejects.toThrow();
    await execute(purchase.contracts.removePromotion, {
      checkoutId: 'chk_test',
    });
    await execute(purchase.contracts.recordPromotionReleases, {
      receipts: [{ ...receipt, status: 'released', finalizeRemoval: true }],
    });
    expect(db.query.checkout.findFirst().sync()?.status).toBe('removed');
    await expect(
      execute(purchase.contracts.recordPromotion, receipt),
    ).rejects.toThrow();
  } finally {
    if (
      '$client' in db &&
      db.$client instanceof Object &&
      'close' in db.$client &&
      typeof db.$client.close === 'function'
    ) {
      db.$client.close();
    }
  }
});

it('retries partially successful remote releases and returns one complete local batch', async () => {
  const { db, config, execute } = await fixture();
  try {
    const now = new Date();
    const base = { version: '1.0.0', createdAt: now, updatedAt: now };
    for (const suffix of ['one', 'two']) {
      db.insert(config.schema.cartPromotion)
        .values({
          ...base,
          id: `prv_${suffix}`,
          modelName: 'cartPromotion',
          cartId: 'crt_test',
          status: 'reserved',
          expiresAt: Date.now() + 60000,
          purchaseId: null,
        })
        .run();
      db.insert(config.schema.checkout)
        .values({
          ...base,
          id: `chk_${suffix}`,
          modelName: 'checkout',
          userId: 'usr_test',
          cartId: 'crt_test',
          promotionReservationId: `prv_${suffix}`,
          purchaseId: null,
          firstPaymentIntentId: null,
          quote: null,
          status: 'removing',
          failure: null,
        })
        .run();
    }
    const released = new Set<string>();
    let fail = true;
    const automation = purchase.automations.releaseCartPromotions;
    const run = () =>
      Effect.runPromise(
        automation
          .program({
            db,
            on: {
              id: 'cmd_remove',
              commandName: 'removeFromCart',
              contractVersion: '1.0.0',
              systemName: 'test',
              aggregateId: 'acct_test',
              aggregateName: 'shopper',
              aggregateVersion: '1.0.0',
              actorName: 'shopper',
              actorVersion: '1.0.0',
              identity,
              nodeId: null,
              nodeIndex: null,
              sessionName: null,
              payload: { releaseCheckoutIds: ['chk_one', 'chk_two'] },
            },
            contracts: {
              recordPromotionReleases: payload => ({
                contract: purchase.contracts.recordPromotionReleases,
                payload,
              }),
            },
          })
          .pipe(
            Effect.provideService(PromotionProvider, request => {
              if (request.reservationId === 'prv_two' && fail) {
                fail = false;
                return Effect.fail(makeZerospinError('response-unavailable'));
              }
              released.add(request.reservationId);
              return Effect.succeed({
                kind: 'confirmed',
                receipt: {
                  status: 'released',
                  expiresAt: null,
                  purchaseId: null,
                },
              });
            }),
          ),
      );
    await expect(run()).rejects.toThrow();
    expect([...released]).toEqual(['prv_one']);
    expect(
      db.query.checkout
        .findMany()
        .sync()
        .every(row => row.status === 'removing'),
    ).toBe(true);
    const output = await run();
    expect(output?.payload.receipts).toHaveLength(2);
    if (output) {
      await execute(output.contract, output.payload);
    }
    expect([...released].sort()).toEqual(['prv_one', 'prv_two']);
    expect(
      db.query.checkout
        .findMany()
        .sync()
        .every(row => row.status === 'removed'),
    ).toBe(true);
  } finally {
    if (
      '$client' in db &&
      db.$client instanceof Object &&
      'close' in db.$client &&
      typeof db.$client.close === 'function'
    ) {
      db.$client.close();
    }
  }
});

it.each(['failed acceptance', 'canceled purchase'])(
  'releases a committed reservation after %s',
  async reason => {
    const { db, execute } = await fixture();
    try {
      await execute(purchase.contracts.applyPromotion, {
        userId: 'usr_test',
        checkoutId: 'chk_test',
        cartId: 'crt_test',
        id: 'prv_test',
      });
      const receipt = {
        checkoutId: 'chk_test',
        id: 'prv_test',
        status: 'reserved',
        expiresAt: Date.now() + 60000,
        purchaseId: null,
        finalizeRemoval: false,
      };
      await execute(purchase.contracts.recordPromotion, receipt);
      const discounted = {
        ...quote,
        promotionReservationId: 'prv_test',
        discountAmount: 300,
        totalAmount: 300,
      };
      await execute(purchase.contracts.confirmCheckout, {
        ...confirm,
        expected: 'promotion',
        quote: discounted,
      });
      await execute(purchase.contracts.recordPromotion, {
        ...receipt,
        status: 'committed',
        purchaseId: 'pur_test',
      });
      if (reason === 'failed acceptance') {
        await execute(purchase.contracts.failCheckout, {
          id: 'chk_test',
          expected: 'accepted',
          failure: 'Acceptance rejected',
        });
      } else {
        await execute(purchase.contracts.createAcceptedPurchase, {
          ...accepted,
          quote: discounted,
        });
        await execute(purchase.contracts.recordPaymentObservation, {
          ...observed,
          outcome: 'declined',
        });
        await execute(purchase.contracts.cancelPurchase, {
          checkoutId: 'chk_test',
          purchaseId: 'pur_test',
        });
      }
      const released = {
        ...receipt,
        status: 'released',
        purchaseId: 'pur_test',
      };
      await execute(purchase.contracts.recordPromotion, released);
      await execute(purchase.contracts.recordPromotion, released);
      expect(db.query.cartPromotion.findFirst().sync()?.status).toBe(
        'released',
      );
      expect(db.query.checkout.findFirst().sync()?.status).toBe(
        reason === 'failed acceptance' ? 'failed' : 'canceled',
      );
    } finally {
      if (
        '$client' in db &&
        db.$client instanceof Object &&
        'close' in db.$client &&
        typeof db.$client.close === 'function'
      ) {
        db.$client.close();
      }
    }
  },
);
