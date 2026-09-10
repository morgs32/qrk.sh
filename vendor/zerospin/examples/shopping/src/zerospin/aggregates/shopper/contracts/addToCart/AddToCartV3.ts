import { contracts, primitives } from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { cartItemV3 } from '../../models/cartItem/CartItemV3';

import { addToCartV1 } from './AddToCartV1';
import { addToCartV2 } from './AddToCartV2';

export const addToCartV3 = contracts.upgradeVersion(addToCartV2, {
  payload: {
    amount: null,
    quantity: primitives.integer(),
  },
  up: ({ payload }) => {
    const { amount, ...rest } = payload;
    return Effect.succeed({ ...rest, quantity: amount });
  },
  down: ({ payload }) => {
    const { quantity, ...rest } = payload;
    return Effect.succeed({ ...rest, amount: quantity });
  },
  guard: addToCartV1.guard,
  models: { cartItem: cartItemV3 },
  program: ({ payload, models }) => {
    const { cartItemId, cartId, product, quantity } = payload;
    return Effect.all({
      product: models.productReplica.replicate(product),
      cartItem: models.cartItem.create({
        resourceId: cartItemId,
        attributes: {
          quantity,
          cartId,
          productId: product.id,
        },
      }),
    });
  },
  version: '3.0.0',
});
