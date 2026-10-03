import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { userClaims } from '../../../../claims';
import { cartV1 } from '../../models/cart/CartV1';
import { cartItemV1 } from '../../models/cartItem/CartItemV1';

import { updateCartItemQuantity } from './updateCartItemQuantity';

export const updateCartItemQuantityV1 = sdk.makeContractVersion(
  updateCartItemQuantity,
  {
    version: '1.0.0',
    claims: userClaims,
    failures: {
      actorDenied: sdk.ActorError.schema({ code: 'actor-denied' }),
      cartUnavailable: sdk.ContractError.schema({ code: 'cart-unavailable' }),
      cartItemNotFound: sdk.ContractError.schema({
        code: 'cart-item-not-found',
      }),
    },
    models: { cart: cartV1, cartItem: cartItemV1 },
    payload: {
      cartItemId: sdk.primitives.foreignKey({ abbreviation: 'cit' }),
      amount: sdk.primitives.integer(),
    },
    guard: ({ payload, claims, db, failures }) =>
      Effect.gen(function* () {
        const item = db.query.cartItem
          .findFirst({ where: { id: { eq: payload.cartItemId } } })
          .sync();
        if (!item) {
          return yield* failures.cartItemNotFound.make({
            message: 'Cart item not found.',
          });
        }
        const cart = db.query.cart
          .findFirst({ where: { id: { eq: item.cartId } } })
          .sync();
        if (cart?.userId !== claims.clerkUserId) {
          yield* failures.cartUnavailable.make({
            message: 'Cart not found or owned by another shopper.',
          });
        }
      }),
    program: ({ payload, models }) =>
      models.cartItem.update({
        resourceId: payload.cartItemId,
        attributes: { amount: payload.amount },
      }),
  },
);
