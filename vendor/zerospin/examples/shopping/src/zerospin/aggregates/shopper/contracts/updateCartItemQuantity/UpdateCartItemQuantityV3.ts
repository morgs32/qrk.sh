import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { userClaims } from '../../../../claims';
import { cartV1 } from '../../models/cart/CartV1';
import { cartItemV3 } from '../../models/cartItem/CartItemV3';
import { userV1 } from '../../models/user/UserV1';
import { purchaseFrontend } from '../../purchaseFrontend';
import { canEditCart } from '../addToCart/AddToCartV1';

import { updateCartItemQuantityV1 } from './UpdateCartItemQuantityV1';
const { checkout: checkoutV1, purchase: purchaseV1 } = purchaseFrontend.models;

export const updateCartItemQuantityV3 = sdk.upgradeContractVersion(
  updateCartItemQuantityV1,
  {
    claims: userClaims,
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
      cartItemNotFound: sdk.ContractError.schema({
        code: 'cart-item-not-found',
      }),
    },
    payload: {},
    up: Effect.fn(function* ({ payload }) {
      return payload;
    }),
    down: Effect.fn(function* ({ payload }) {
      return payload;
    }),
    models: {
      cart: cartV1,
      user: userV1,
      purchase: purchaseV1,
      checkout: checkoutV1,
      cartItem: cartItemV3,
    },
    guard: Effect.fn('updateCartItemQuantityV3.guard')(function* ({
      failures,
      payload,
      claims,
      db,
    }) {
      const resource = yield* Effect.try({
        try: () =>
          db.query.cartItem
            .findFirst({ where: { id: { eq: payload.cartItemId } } })
            .sync(),
        catch: sdk.catchZerospinError({
          code: 'cartItem-guard-query-failed',
          message: 'Failed to query cartItem during guard evaluation',
        }),
      });
      if (resource === undefined || resource.cartId === null) {
        return yield* Effect.fail(
          failures.cartItemNotFound.make({
            message: `cartItem ${payload.cartItemId} was not found`,
          }),
        );
      }

      yield* canEditCart({
        failures,
        cartId: resource.cartId,
        cart: db.query.cart
          .findFirst({ where: { id: { eq: resource.cartId } } })
          .sync(),
        user: db.query.user
          .findFirst({
            where: { clerkUserId: { eq: claims.clerkUserId } },
          })
          .sync(),
        hasPendingPurchase:
          db.query.checkout
            .findFirst({
              where: {
                cartId: { eq: resource.cartId },
                status: { in: ['accepted', 'paying', 'declined'] },
              },
            })
            .sync() !== undefined ||
          db.query.purchase
            .findFirst({
              where: {
                cartId: { eq: resource.cartId },
                status: { in: ['unpaid'] },
              },
            })
            .sync() !== undefined,
      });
    }),
    program: ({ payload, models }) =>
      Effect.gen(function* () {
        const { amount, cartItemId } = payload;
        return yield* Effect.all([
          models.cartItem.update({
            resourceId: cartItemId,
            attributes: { quantity: amount },
          }),
        ]);
      }),
    version: '3.0.0',
  },
);
