import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { userClaims } from '../../../../claims';
import { cartItemV3 } from '../../models/cartItem/CartItemV3';

import { canEditCart } from './AddToCartV1';
import { addToCartV2 } from './AddToCartV2';
export const addToCartV3 = sdk.upgradeContractVersion(addToCartV2, {
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
  claims: userClaims,
  guard: Effect.fn('addToCartV3.guard')(function* ({
    failures,
    payload,
    claims,
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
          where: { clerkUserId: { eq: claims.clerkUserId } },
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
    amount: null,
    quantity: sdk.primitives.integer(),
  },
  up: Effect.fn('addToCartV3.up')(function* ({ payload }) {
    const { amount, ...rest } = payload;
    return { ...rest, quantity: amount };
  }),
  down: Effect.fn('addToCartV3.down')(function* ({ payload }) {
    const { quantity, ...rest } = payload;
    return { ...rest, amount: quantity };
  }),
  models: { cartItem: cartItemV3 },
  program: ({ payload, models }) =>
    Effect.gen(function* () {
      const { cartItemId, cartId, product, quantity } = payload;
      return yield* Effect.all([
        models.productReplica.replicate(product),
        models.cartItem.create({
          resourceId: cartItemId,
          attributes: {
            quantity,
            cartId,
            productId: product.id,
          },
        }),
      ]);
    }),
  version: '3.0.0',
});
