import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { shopperIdentitySchema } from '../../actors/identities';
import { cartItemV2 } from '../../models/cartItem/CartItemV2';

import { addToCartV1, canEditCart } from './AddToCartV1';
export const addToCartV2 = sdk.upgradeContractVersion(addToCartV1, {
  failures: {
    cartFrozen: sdk.ContractError.schema({
      code: 'cart-frozen',
      extra: Schema.Struct({ cartId: Schema.String }),
    }),
    cartUnavailable: sdk.ContractError.schema({
      code: 'cart-unavailable',
      extra: Schema.Struct({ cartId: Schema.String }),
    }),
    actorDenied: sdk.ActorError.schema({
      code: 'actor-denied',
      extra: Schema.Struct({ operation: Schema.String }),
    }),
  },
  identity: shopperIdentitySchema,
  guard: Effect.fn('addToCartV2.guard')(function* ({
    failures,
    payload,
    identity,
    queryDb,
  }) {
    return yield* canEditCart({
      failures,
      cartId: payload.cartId,
      cart: queryDb.query.cart
        .findFirst({ where: { id: { eq: payload.cartId } } })
        .sync(),
      user: queryDb.query.user
        .findFirst({
          where: { clerkUserId: { eq: identity.clerkUserId } },
        })
        .sync(),
      hasPendingPurchase:
        queryDb.query.checkout
          .findFirst({
            where: {
              cartId: { eq: payload.cartId },
              status: { in: ['accepted', 'paying', 'declined'] },
            },
          })
          .sync() !== undefined ||
        queryDb.query.purchase
          .findFirst({
            where: {
              cartId: { eq: payload.cartId },
              status: { in: ['unpaid'] },
            },
          })
          .sync() !== undefined,
    });
  }),
  payload: {
    amount: sdk.primitives.integer(),
  },
  up: Effect.fn('addToCartV2.up')(function* ({ payload }) {
    return { ...payload, amount: 1 };
  }),
  down: Effect.fn('addToCartV2.down')(function* ({ payload }) {
    const { amount: _amount, ...rest } = payload;
    return rest;
  }),
  models: { cartItem: cartItemV2 },
  program: ({ payload, models }) =>
    Effect.gen(function* () {
      const { cartItemId, cartId, product, amount } = payload;
      return yield* Effect.all([
        models.productReplica.replicate(product),
        models.cartItem.create({
          resourceId: cartItemId,
          attributes: {
            amount,
            cartId,
            productId: product.id,
          },
        }),
      ]);
    }),
  version: '2.0.0',
});
