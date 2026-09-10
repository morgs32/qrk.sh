import { contracts, primitives } from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { cartItemV2 } from '../../models/cartItem/CartItemV2';

import { addToCartV1 } from './AddToCartV1';

export const addToCartV2 = contracts.upgradeVersion(addToCartV1, {
  payload: {
    amount: primitives.integer(),
  },
  up: ({ payload }) => Effect.succeed({ ...payload, amount: 1 }),
  down: ({ payload }) => {
    const { amount: _amount, ...rest } = payload;
    return Effect.succeed(rest);
  },
  guard: addToCartV1.guard,
  models: { cartItem: cartItemV2 },
  program: ({ payload, models }) => {
    const { cartItemId, cartId, product, amount } = payload;
    return Effect.all({
      product: models.productReplica.replicate(product),
      cartItem: models.cartItem.create({
        resourceId: cartItemId,
        attributes: {
          amount,
          cartId,
          productId: product.id,
        },
      }),
    });
  },
  version: '2.0.0',
});
