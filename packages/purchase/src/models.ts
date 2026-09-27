import * as sdk from '@zerospin/sdk/browser';

import type { IPurchaseHostModels } from './host.js';
import { PurchaseQuoteSchema } from './quote.js';
export const makePurchaseModels = <const HOST extends IPurchaseHostModels>(
  host: HOST,
) => {
  const cartV1: HOST['cart'] = host.cart;
  const cartTable: HOST['cart']['table'] = host.cart.table;
  const productReplicaV1: HOST['product'] = host.product;
  const productTable: HOST['product']['table'] = host.product.table;
  const userV1: HOST['user'] = host.user;
  const userTable: HOST['user']['table'] = host.user.table;
  const purchase = sdk.defineModel({
    name: 'purchase',
    abbreviation: 'pur',
  });
  const purchaseV1 = sdk.makeModelVersion(purchase, {
    version: '1.0.0',
    attributes: {
      cartId: {
        ...sdk.primitives.ref({
          table: cartV1.table,
          relation: 'cart',
          inverse: 'purchases',
          nullable: false,
        }),
        table: cartTable,
      },
      currency: sdk.primitives.enum({ values: ['usd'] }),
      subtotalAmount: sdk.primitives.integer(),
      discountAmount: sdk.primitives.integer(),
      promotionReservationId: sdk.primitives.foreignKey({
        abbreviation: 'prv',
        nullable: true,
      }),
      totalAmount: sdk.primitives.integer(),
      status: sdk.primitives.enum({
        values: ['unpaid', 'paid', 'canceled'],
      }),
    },
    indexes: [],
  });

  const purchaseItem = sdk.defineModel({
    name: 'purchaseItem',
    abbreviation: 'pui',
  });
  const purchaseItemV1 = sdk.makeModelVersion(purchaseItem, {
    version: '1.0.0',
    attributes: {
      purchaseId: sdk.primitives.ref({
        table: purchaseV1.table,
        relation: 'purchase',
        inverse: 'items',
        nullable: false,
      }),
      productId: {
        ...sdk.primitives.ref({
          table: productReplicaV1.table,
          relation: 'product',
          inverse: 'purchaseItems',
          nullable: false,
        }),
        table: productTable,
      },
      name: sdk.primitives.text(),
      quantity: sdk.primitives.integer(),
      unitAmount: sdk.primitives.integer(),
    },
    indexes: [],
  });

  const checkoutV1 = sdk.makeModelVersion(
    sdk.defineModel({ name: 'checkout', abbreviation: 'chk' }),
    {
      version: '1.0.0',
      attributes: {
        cartId: {
          ...sdk.primitives.ref({
            table: cartV1.table,
            relation: 'cart',
            inverse: 'checkouts',
            nullable: false,
          }),
          table: cartTable,
        },
        userId: {
          ...sdk.primitives.ref({
            table: userV1.table,
            relation: 'user',
            inverse: 'checkouts',
            nullable: false,
          }),
          table: userTable,
        },
        promotionReservationId: sdk.primitives.foreignKey({
          abbreviation: 'prv',
          nullable: true,
        }),
        purchaseId: sdk.primitives.foreignKey({
          abbreviation: 'pur',
          nullable: true,
        }),
        firstPaymentIntentId: sdk.primitives.foreignKey({
          abbreviation: 'pmt',
          nullable: true,
        }),
        quote: sdk.primitives.json({
          schema: PurchaseQuoteSchema,
          nullable: true,
        }),
        status: sdk.primitives.enum({
          values: [
            'promotion',
            'accepted',
            'paying',
            'declined',
            'paid',
            'canceled',
            'removing',
            'removed',
            'failed',
          ],
        }),
        failure: sdk.primitives.text({ nullable: true }),
      },
      indexes: [],
    },
  );

  /** One row per collection attempt; terminal attempts are never reused. */
  const paymentIntentV1 = sdk.makeModelVersion(
    sdk.defineModel({ name: 'paymentIntent', abbreviation: 'pmt' }),
    {
      version: '1.0.0',
      attributes: {
        purchaseId: sdk.primitives.ref({
          table: purchaseV1.table,
          relation: 'purchase',
          inverse: 'paymentIntents',
          nullable: false,
        }),
        status: sdk.primitives.enum({
          values: [
            'pending',
            'executing',
            'uncertain',
            'succeeded',
            'declined',
          ],
        }),
        providerReference: sdk.primitives.text({ nullable: true }),
        failure: sdk.primitives.text({ nullable: true }),
      },
      indexes: [],
    },
  );
  const cartPromotionV1 = sdk.makeModelVersion(
    sdk.defineModel({ name: 'cartPromotion', abbreviation: 'prv' }),
    {
      version: '1.0.0',
      attributes: {
        cartId: {
          ...sdk.primitives.ref({
            table: cartV1.table,
            relation: 'cart',
            inverse: 'promotions',
            nullable: false,
          }),
          table: cartTable,
        },
        status: sdk.primitives.enum({
          values: [
            'requested',
            'reserved',
            'committed',
            'released',
            'redeemed',
            'denied',
          ],
        }),
        expiresAt: sdk.primitives.integer({ nullable: true }),
        purchaseId: sdk.primitives.text({ nullable: true }),
      },
      indexes: [],
    },
  );

  return {
    checkout: checkoutV1,
    purchase: purchaseV1,
    purchaseItem: purchaseItemV1,
    paymentIntent: paymentIntentV1,
    cartPromotion: cartPromotionV1,
  };
};
