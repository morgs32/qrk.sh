import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { userClaims } from '../../../../claims';
import { cartV1 } from '../../models/cart/CartV1';
import { cartItem } from '../../models/cartItem/cartItem';
import { cartItemV2 } from '../../models/cartItem/CartItemV2';
import { userV1 } from '../../models/user/UserV1';
import { purchaseFrontend } from '../../purchaseFrontend';
import { canEditCart } from '../addToCart/AddToCartV1';

import { updateCartItemQuantity } from './updateCartItemQuantity';
const { checkout: checkoutV1, purchase: purchaseV1 } = purchaseFrontend.models;

export const updateCartItemQuantityV1 = sdk.makeContractVersion(
  updateCartItemQuantity,
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
    payload: {
      cartItemId: sdk.primitives.foreignKey({
        abbreviation: cartItem.abbreviation,
      }),
      amount: sdk.primitives.integer(),
    },

    models: {
      cart: cartV1,
      user: userV1,
      purchase: purchaseV1,
      checkout: checkoutV1,
      cartItem: cartItemV2,
    },
    guard: Effect.fn('updateCartItemQuantityV1.guard')(function* ({
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
            attributes: { amount },
          }),
        ]);
      }),
    version: '2.0.0',
  },
);
