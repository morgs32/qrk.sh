import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { userClaims } from '../../../../claims';
import { cartV1 } from '../../models/cart/CartV1';
import { cartItem } from '../../models/cartItem/cartItem';
import { cartItemV1 } from '../../models/cartItem/CartItemV1';
import { userV1 } from '../../models/user/UserV1';
import { purchaseFrontend } from '../../purchaseFrontend';
import { canEditCart } from '../addToCart/AddToCartV1';

import { removeFromCart } from './removeFromCart';
const { checkout: checkoutV1, purchase: purchaseV1 } = purchaseFrontend.models;

export const removeFromCartV1 = sdk.makeContractVersion(removeFromCart, {
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
    id: sdk.primitives.foreignKey({ abbreviation: cartItem.abbreviation }),
  },

  models: {
    cart: cartV1,
    user: userV1,
    purchase: purchaseV1,
    checkout: checkoutV1,
    cartItem: cartItemV1,
  },
  guard: Effect.fn('removeFromCartV1.guard')(function* ({
    failures,
    payload,
    claims,
    queryDb,
  }) {
    const db = queryDb;
    const resource = yield* Effect.try({
      try: () =>
        db.query.cartItem
          .findFirst({ where: { id: { eq: payload.id } } })
          .sync(),
      catch: sdk.catchZerospinError({
        code: 'cartItem-guard-query-failed',
        message: 'Failed to query cartItem during guard evaluation',
      }),
    });
    if (resource === undefined || resource.cartId === null) {
      return yield* Effect.fail(
        failures.cartItemNotFound.make({
          message: `cartItem ${payload.id} was not found`,
        }),
      );
    }

    yield* canEditCart({
      failures,
      cartId: resource.cartId,
      cart: queryDb.query.cart
        .findFirst({ where: { id: { eq: resource.cartId } } })
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
              cartId: { eq: resource.cartId },
              status: { in: ['accepted', 'paying', 'declined'] },
            },
          })
          .sync() !== undefined ||
        queryDb.query.purchase
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
      const { id } = payload;
      return yield* Effect.all([
        models.cartItem.delete({
          resourceId: id,
        }),
      ]);
    }),
  version: '1.0.0',
});
