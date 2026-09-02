import { makeContract, primitives } from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { Cart } from '../models/Cart';
import { CartItem } from '../models/CartItem';
import { Product } from '../models/Product';
import { ProductReplica } from '../models/ProductReplica';

export const addToCart = makeContract({
  commandName: 'addToCart',
  payload: {
    cartId: Cart.primaryKey({ autogenerate: false }),
    id: CartItem.primaryKey({ autogenerate: true }),
    product: primitives.json({ schema: Product.resourceSchema }),
    quantity: primitives.integer(),
  },
  mutations: Schema.Struct({
    product: ProductReplica.replicateResourceMutation('1.0.0'),
    cartItem: CartItem.createMutation('2.0.0'),
  }),
  program: ({ payload }) => {
    const { id, cartId, product, quantity } = payload;
    return Effect.all({
      product: ProductReplica.replicateResource('1.0.0', {
        resource: product,
      }),
      cartItem: CartItem.create('2.0.0', {
        resourceId: id,
        attributes: {
          amount: quantity,
          cartId,
          productId: product.id,
          unit: 'item',
        },
      }),
    });
  },
  version: '1.0.0',
});
