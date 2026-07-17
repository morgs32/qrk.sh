import { makeContract } from '@zerospin/core/contracts/makeContract';
import { primitives } from '@zerospin/core/models/primitives';
import { prefixActorId } from '@zerospin/core/utils/prefixActorId';
import { Effect, Schema } from 'effect';

import { Cart, CartItem, Product, User } from './models';

export const createUser = makeContract({
  commandName: 'createUser',
  payload: {
    id: User.primaryKey({ autogenerate: false }),
    clerkUserId: primitives.text(),
  },
  mutations: Schema.Struct({
    created: User.createMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id, clerkUserId } = payload;
    const actorId = prefixActorId(clerkUserId);
    return Effect.all({
      created: User.create('1.0.0', {
        resourceId: id,
        attributes: {
          actorId,
          name: null,
        },
      }),
    });
  },
  version: '1.0.0',
});

export const updateUser = makeContract({
  commandName: 'updateUser',
  payload: {
    id: User.primaryKey({ autogenerate: false }),
    name: primitives.text(),
  },
  mutations: Schema.Struct({
    updated: User.updateMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id, name } = payload;
    return Effect.all({
      updated: User.update('1.0.0', {
        resourceId: id,
        attributes: { name },
      }),
    });
  },
  version: '1.0.0',
});

export const createProduct = makeContract({
  commandName: 'createProduct',
  payload: {
    id: Product.primaryKey({ autogenerate: true }),
    description: primitives.text(),
    name: primitives.text(),
    price: primitives.integer(),
  },
  mutations: Schema.Struct({
    created: Product.createMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { description, id, name, price } = payload;
    return Effect.all({
      created: Product.create('1.0.0', {
        resourceId: id,
        attributes: { description, name, price },
      }),
    });
  },
  version: '1.0.0',
});

export const createCart = makeContract({
  commandName: 'createCart',
  payload: {
    id: Cart.primaryKey({ autogenerate: true }),
    userId: User.primaryKey({ autogenerate: false }),
  },
  mutations: Schema.Struct({
    created: Cart.createMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id, userId } = payload;
    return Effect.all({
      created: Cart.create('1.0.0', {
        resourceId: id,
        attributes: { userId },
      }),
    });
  },
  version: '1.0.0',
});

export const addToCart = makeContract({
  commandName: 'addToCart',
  payload: {
    cartId: Cart.primaryKey({ autogenerate: false }),
    id: CartItem.primaryKey({ autogenerate: true }),
    product: primitives.json({ schema: Product.resourceSchema }),
    quantity: primitives.integer(),
  },
  mutations: Schema.Struct({
    cartItem: CartItem.createMutation('1.0.0'),
    product: Product.replicateResourceMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id, cartId, product, quantity } = payload;
    return Effect.all({
      cartItem: CartItem.create('1.0.0', {
        resourceId: id,
        attributes: { cartId, productId: product.id, quantity },
      }),
      product: Product.replicateResource('1.0.0', {
        resource: product,
      }),
    });
  },
  version: '1.0.0',
});

export const updateCartItemQuantity = makeContract({
  commandName: 'updateCartItemQuantity',
  payload: {
    id: CartItem.primaryKey({ autogenerate: false }),
    quantity: primitives.integer(),
  },
  mutations: Schema.Struct({
    updated: CartItem.updateMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id, quantity } = payload;
    return Effect.all({
      updated: CartItem.update('1.0.0', {
        resourceId: id,
        attributes: { quantity },
      }),
    });
  },
  version: '1.0.0',
});

export const removeFromCart = makeContract({
  commandName: 'removeFromCart',
  payload: {
    id: CartItem.primaryKey({ autogenerate: false }),
  },
  mutations: Schema.Struct({
    deleted: CartItem.deleteMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id } = payload;
    return Effect.all({
      deleted: CartItem.delete('1.0.0', {
        resourceId: id,
      }),
    });
  },
  version: '1.0.0',
});
