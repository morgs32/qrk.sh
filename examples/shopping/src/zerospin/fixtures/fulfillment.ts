import assert from 'node:assert/strict';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { applyOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import { decodePayload } from '@zerospin/core/contracts/decodePayload/decodePayload';
import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import { makeOperations } from '@zerospin/core/contracts/make/makeOperations';
import { prepareContractInput } from '@zerospin/core/contracts/prepareContractInput';
import type { IContract } from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { Context, Effect, Schema } from 'effect';

import { agents } from '../../../agents';
import { checkoutIdentity } from '../../checkoutIdentity';
import { adminActorV1 } from '../aggregates/user/actors/adminActorV1';
import { createPurchaseV1 } from '../aggregates/user/contracts/createPurchaseV1';
import { createTrackingLabelV1 } from '../aggregates/user/contracts/createTrackingLabelV1';
import {
  asyncCreateTrackingLabelV1,
  asyncProcessPaymentV1,
  asyncUpdateTrackingInfoV1,
  mappedCreatePurchaseV1,
  mappedCreateTrackingLabelV1,
  mappedUpdateTrackingInfoV1,
} from '../aggregates/user/contracts/fulfillmentContracts';
import { updateTrackingInfoV1 } from '../aggregates/user/contracts/updateTrackingInfoV1';
import { purchaseV1 } from '../aggregates/user/models/purchase/PurchaseV1';
import { purchaseItemV1 } from '../aggregates/user/models/purchaseItem/PurchaseItemV1';
import { ClerkUserIdSchema } from '../claims';
import { PurchaseQuote } from '../purchaseQuote';
import {
  asyncCreatePurchaseV1,
  mappedCheckoutV1,
} from '../services/marketplace/contracts/checkout/mappedCheckoutV1';
import { cartV1 } from '../services/marketplace/models/cart/CartV1';
import { cartItemV1 } from '../services/marketplace/models/cartItem/CartItemV1';
import { productV1 } from '../services/marketplace/models/product/ProductV1';
import { ShoppingProviders } from '../ShoppingProviders';
import { ShoppingProvidersLive } from '../ShoppingProvidersLive';
import { purchaseDeliveryCommand } from '../ShoppingPurchaseDelivery';
import { system } from '../system';

const alice = {
  clerkUserId: Schema.decodeUnknownSync(ClerkUserIdSchema)('user_alice'),
};
const bob = {
  clerkUserId: Schema.decodeUnknownSync(ClerkUserIdSchema)('user_bob'),
};
const claims = { aggregateId: 'acct_user_alice' };
const run = Effect.runSyncWith(Context.makeUnsafe<unknown>(new Map()));
const agent = agents.purchases;
assert.equal(
  agent.store.getState().isInitialized,
  false,
  'cold import acquires no session DB',
);
assert.equal(agent.connection.getState().status, 'idle');
assert.equal(agent.definition.actorName, 'admin');
assert.deepEqual(Object.keys(agent.definition.contracts), [
  'createTrackingLabel',
  'updateTrackingInfo',
]);
assert.equal(adminActorV1.authentication, 'system');
assert.equal(
  adminActorV1.contracts.createTrackingLabel.mapping.original,
  createTrackingLabelV1,
);
assert.equal(
  adminActorV1.contracts.updateTrackingInfo.mapping.original,
  updateTrackingInfoV1,
);
assert.equal(
  makeSystemSpec({ system }).agents.purchases?.selections.purchase?.modelName,
  'purchase',
);
const identity = await checkoutIdentity(alice.clerkUserId, 'nonce-fixture');
assert.deepEqual(
  identity,
  await checkoutIdentity(alice.clerkUserId, 'nonce-fixture'),
);
assert.notEqual(
  identity.purchaseId,
  (await checkoutIdentity(bob.clerkUserId, 'nonce-fixture')).purchaseId,
);
await Effect.runPromise(
  Effect.gen(function* () {
    const models = {
      cart: cartV1,
      cartItem: cartItemV1,
      product: productV1,
      purchase: purchaseV1,
      purchaseItem: purchaseItemV1,
    };
    const config = makeResourceDbConfig({ models, otherTables: {} });
    const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig: config });
    const other = yield* makeProvisionedInMemorySqljsDb({ dbConfig: config });
    const base = {
      version: '1.0.0' as const,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    db.insert(config.schema.product)
      .values({
        ...base,
        modelName: 'product',
        id: 'prd_one',
        name: 'Authoritative snapshot',
        description: 'Owner',
        price: 20,
      })
      .run();
    db.insert(config.schema.cart)
      .values([
        {
          ...base,
          modelName: 'cart',
          id: 'crt_alice',
          userId: alice.clerkUserId,
        },
        { ...base, modelName: 'cart', id: 'crt_bob', userId: bob.clerkUserId },
      ])
      .run();
    db.insert(config.schema.cartItem)
      .values([
        {
          ...base,
          modelName: 'cartItem',
          id: 'cit_alice',
          cartId: 'crt_alice',
          productId: 'prd_one',
          amount: 2,
        },
        {
          ...base,
          modelName: 'cartItem',
          id: 'cit_bob',
          cartId: 'crt_bob',
          productId: 'prd_one',
          amount: 1,
        },
      ])
      .run();
    let next = 0;
    const execute = (
      contract: IContract,
      payload: unknown,
      options: {
        db?: typeof db;
        claims?: Record<string, unknown>;
        response?: unknown;
        rollback?: boolean;
      } = {},
    ) => {
      const database = options.db ?? db;
      return database.transaction(tx => {
        const id = `cmd_fixture_${++next}` as const;
        const command = {
          id,
          commandName: contract.commandName,
          contractVersion: contract.version,
          payload:
            contract.external === undefined
              ? payload
              : Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(
                  run(
                    encodePayload(contract, {
                      version: contract.version,
                      payload,
                    }),
                  ),
                ),
          ...(options.response === undefined
            ? {}
            : {
                response: Schema.decodeUnknownSync(Schema.Json)(
                  options.response,
                ),
              }),
        };
        const input = run(
          prepareContractInput({
            contract,
            command,
            claims: options.claims ?? claims,
          }),
        );
        const output = run(
          makeOperations({ db: tx, contract, models, command, input }),
        );
        for (const [operationIndex, operation] of output.operations.entries()) {
          if (operation.operationName !== 'async') {
            Effect.runSync(
              applyOperationTx({
                tx,
                operation,
                commandId: id,
                operationIndex,
                appliedAt: new Date(next),
              }),
            );
          }
        }
        if (options.rollback) throw new Error('fixture commit failure');
        return output;
      });
    };
    const checkoutPayload = {
      cartId: 'crt_alice',
      purchaseId: identity.purchaseId,
    };
    assert.throws(() =>
      execute(mappedCheckoutV1, checkoutPayload, { claims: bob }),
    );
    assert.throws(() =>
      execute(mappedCheckoutV1, checkoutPayload, {
        claims: alice,
        rollback: true,
      }),
    );
    assert.equal(db.query.cartItem.findMany().sync().length, 2);
    const checkout = execute(mappedCheckoutV1, checkoutPayload, {
      claims: alice,
    });
    const quote = Schema.decodeUnknownSync(PurchaseQuote)(checkout.result);
    assert.equal(quote.total, 40);
    assert.equal(quote.items[0]?.name, 'Authoritative snapshot');
    assert.equal(
      checkout.operations.filter(op => op.operationName === 'async').length,
      1,
    );
    const transfer = checkout.operations.find(
      op => op.operationName === 'async',
    );
    assert.ok(transfer && transfer.operationName === 'async');
    assert.equal(transfer.contract, asyncCreatePurchaseV1);
    assert.deepEqual(transfer.payload, {
      aggregateId: claims.aggregateId,
      quote,
    });
    assert.throws(() =>
      execute(asyncCreatePurchaseV1, transfer.payload, { claims: alice }),
    );
    assert.equal(
      execute(asyncCreatePurchaseV1, transfer.payload, {
        claims: alice,
        response: null,
      }).result,
      null,
      'an explicit null response completes the transfer continuation',
    );
    assert.deepEqual(
      db.query.cartItem
        .findMany()
        .sync()
        .map(item => item.id),
      ['cit_bob'],
    );
    db.insert(config.schema.cartItem)
      .values({
        ...base,
        modelName: 'cartItem',
        id: 'cit_later',
        cartId: 'crt_alice',
        productId: 'prd_one',
        amount: 3,
      })
      .run();
    db.update(config.schema.product)
      .set({ price: 90, name: 'Changed after checkout' })
      .run();
    assert.deepEqual(
      purchaseDeliveryCommand({ aggregateId: claims.aggregateId, quote }),
      purchaseDeliveryCommand({ aggregateId: claims.aggregateId, quote }),
    );
    assert.deepEqual(
      Effect.runSync(
        decodePayload(createPurchaseV1, {
          command: purchaseDeliveryCommand({
            aggregateId: claims.aggregateId,
            quote,
          }),
        }),
      ),
      { quote },
    );
    assert.throws(() =>
      execute(mappedCreatePurchaseV1, { quote }, { rollback: true }),
    );
    assert.equal(db.query.purchase.findMany().sync().length, 0);
    assert.equal(db.query.purchaseItem.findMany().sync().length, 0);
    const creation = execute(mappedCreatePurchaseV1, { quote });
    assert.equal(
      creation.operations.filter(op => op.operationName === 'async').length,
      1,
    );
    assert.equal(db.query.purchase.findFirst().sync()?.paymentState, 'pending');
    assert.equal(db.query.purchaseItem.findFirst().sync()?.price, 20);
    assert.equal(
      execute(mappedCreatePurchaseV1, { quote }).operations.length,
      0,
    );
    assert.throws(() =>
      execute(createPurchaseV1, { quote: { ...quote, total: 41 } }),
    );
    assert.throws(() =>
      execute(createTrackingLabelV1, { purchaseId: quote.purchaseId }),
    );
    assert.throws(() =>
      execute(updateTrackingInfoV1, { purchaseId: quote.purchaseId }),
    );
    const payment = creation.operations.find(
      op => op.operationName === 'async',
    );
    assert.ok(payment && payment.operationName === 'async');
    const paymentInput = Schema.decodeUnknownSync(
      Schema.Struct({
        purchaseId: Schema.String,
        key: Schema.String,
        total: Schema.Number,
      }),
    )(payment.payload);
    const provider = yield* ShoppingProviders;
    const paid = yield* provider.pay(paymentInput);
    assert.throws(() => execute(asyncProcessPaymentV1, paymentInput));
    assert.throws(() =>
      execute(asyncProcessPaymentV1, paymentInput, {
        response: { ...paid, key: 'payment-for-another-intent' },
      }),
    );
    assert.throws(() =>
      execute(
        asyncProcessPaymentV1,
        { ...paymentInput, total: paymentInput.total + 1 },
        { response: paid },
      ),
    );
    assert.equal(
      db.query.purchase.findFirst().sync()?.paymentState,
      'pending',
      'missing or stale payment responses leave the pending purchase unchanged',
    );
    execute(asyncProcessPaymentV1, paymentInput, { response: paid });
    assert.equal(db.query.purchase.findFirst().sync()?.paymentState, 'paid');
    assert.throws(() =>
      execute(
        mappedCreateTrackingLabelV1,
        { purchaseId: quote.purchaseId },
        { db: other, claims: { aggregateId: 'acct_user_bob' } },
      ),
    );
    const label = execute(mappedCreateTrackingLabelV1, {
      purchaseId: quote.purchaseId,
    });
    assert.equal(db.query.purchase.findFirst().sync()?.labelState, 'requested');
    assert.equal(
      execute(mappedCreateTrackingLabelV1, { purchaseId: quote.purchaseId })
        .operations.length,
      0,
      'concurrent label reservation coalesces',
    );
    const labelWork = label.operations.find(op => op.operationName === 'async');
    assert.ok(labelWork && labelWork.operationName === 'async');
    const labelInput = Schema.decodeUnknownSync(
      Schema.Struct({ purchaseId: Schema.String, key: Schema.String }),
    )(labelWork.payload);
    execute(asyncCreateTrackingLabelV1, labelInput, {
      response: yield* provider.createLabel(labelInput),
    });
    assert.equal(
      db.query.purchase.findFirst().sync()?.trackingStatus,
      'pre_transit',
    );
    assert.equal(
      execute(mappedCreateTrackingLabelV1, { purchaseId: quote.purchaseId })
        .operations.length,
      0,
    );
    for (const sequence of [1, 2]) {
      const refresh = execute(mappedUpdateTrackingInfoV1, {
        purchaseId: quote.purchaseId,
      });
      assert.equal(
        execute(mappedUpdateTrackingInfoV1, { purchaseId: quote.purchaseId })
          .operations.length,
        0,
        'concurrent refresh coalesces',
      );
      const work = refresh.operations.find(op => op.operationName === 'async');
      assert.ok(work && work.operationName === 'async');
      const input = Schema.decodeUnknownSync(
        Schema.Struct({
          purchaseId: Schema.String,
          key: Schema.String,
          labelReference: Schema.String,
          sequence: Schema.Number,
        }),
      )(work.payload);
      const observation = yield* provider.refresh(input);
      assert.throws(() =>
        execute(asyncUpdateTrackingInfoV1, input, {
          response: { ...observation, sequence: 100 },
        }),
      );
      assert.equal(
        db.query.purchase.findFirst().sync()?.trackingRefreshPending,
        true,
      );
      execute(asyncUpdateTrackingInfoV1, input, { response: observation });
      assert.throws(
        () =>
          execute(asyncUpdateTrackingInfoV1, input, { response: observation }),
        'stale observation cannot overwrite later state',
      );
      assert.equal(
        db.query.purchase.findFirst().sync()?.trackingStatus,
        sequence === 1 ? 'in_transit' : 'delivered',
      );
    }
    assert.deepEqual(
      db.query.purchase
        .findMany({ where: { paymentState: { eq: 'paid' } } })
        .sync()
        .map(purchase => purchase.id),
      [quote.purchaseId],
    );
    const declinedQuote = {
      ...quote,
      purchaseId: 'pur_declined' as const,
      items: quote.items.map(item => ({
        ...item,
        id: 'pit_declined' as const,
      })),
    };
    const decline = execute(
      mappedCreatePurchaseV1,
      { quote: declinedQuote },
      { db: other, claims: { aggregateId: 'acct_user_bob' } },
    );
    const declineWork = decline.operations.find(
      op => op.operationName === 'async',
    );
    assert.ok(declineWork && declineWork.operationName === 'async');
    const declineInput = Schema.decodeUnknownSync(
      Schema.Struct({
        purchaseId: Schema.String,
        key: Schema.String,
        total: Schema.Number,
      }),
    )(declineWork.payload);
    execute(asyncProcessPaymentV1, declineInput, {
      db: other,
      claims: { aggregateId: 'acct_user_bob' },
      response: {
        key: declineInput.key,
        state: 'declined',
        reference: 'payment-decline',
        evidence: 'declined-provider-observation',
      },
    });
    assert.equal(
      other.query.purchase.findFirst().sync()?.paymentState,
      'declined',
    );
    assert.equal(other.query.purchaseItem.findMany().sync().length, 1);
    assert.throws(() =>
      execute(
        createTrackingLabelV1,
        { purchaseId: declinedQuote.purchaseId },
        { db: other },
      ),
    );
    assert.equal(
      db.query.cartItem.findFirst({ where: { id: { eq: 'cit_later' } } }).sync()
        ?.amount,
      3,
      'later additions remain untouched',
    );
  }).pipe(Effect.provide(ShoppingProvidersLive), Effect.provide(AsyncLive)),
);
await system.runtime.dispose();
console.log(
  'Shopping authoritative checkout, atomic rollback, immutable quote/delivery identities, payment, label/refresh coalescing, stale evidence and two-user isolation passed',
);
