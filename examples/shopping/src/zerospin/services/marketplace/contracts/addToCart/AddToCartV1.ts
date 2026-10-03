import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { userClaims } from '../../../../claims';
import { cartV1 } from '../../models/cart/CartV1';
import { cartItemV1 } from '../../models/cartItem/CartItemV1';
import { productV1 } from '../../models/product/ProductV1';

import { addToCart } from './addToCart';

export const addToCartV1 = sdk.makeContractVersion(addToCart, {
  version: '1.0.0',
  result: Schema.Null,
  claims: userClaims,
  failures: {
    actorDenied: sdk.ActorError.schema({ code: 'actor-denied' }),
    cartUnavailable: sdk.ContractError.schema({ code: 'cart-unavailable' }),
    productNotFound: sdk.ContractError.schema({ code: 'product-not-found' }),
  },
  models: { cart: cartV1, cartItem: cartItemV1, product: productV1 },
  payload: {
    cartId: sdk.primitives.foreignKey({ abbreviation: 'crt' }),
    cartItemId: sdk.primitives.foreignKey({ abbreviation: 'cit' }),
    product: sdk.primitives.json({ schema: productV1.resourceSchema }),
    amount: sdk.primitives.integer(),
  },
  guard: ({ payload, claims, db, failures }) =>
    Effect.gen(function* () {
      const cart = db.query.cart
        .findFirst({ where: { id: { eq: payload.cartId } } })
        .sync();
      if (cart?.userId !== claims.clerkUserId) {
        yield* failures.cartUnavailable.make({
          message: 'Cart not found or owned by another shopper.',
        });
      }
    }),
  program: ({ payload, db, models }) =>
    Effect.gen(function* () {
      const { cartItemId, cartId, product, amount } = payload;
      if (
        !db.query.product
          .findFirst({ where: { id: { eq: product.id } } })
          .sync()
      ) {
        yield* models.product.create({
          resourceId: product.id,
          attributes: {
            name: product.name,
            description: product.description,
            price: product.price,
          },
        });
      }
      yield* models.cartItem.create({
        resourceId: cartItemId,
        attributes: { cartId, productId: product.id, amount },
      });
      return null;
    }),
});
