import { makeContract, primitives } from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { Cart, CartItem, CatalogMarker, Product, User } from './models';

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
    return Effect.all({
      created: User.create('1.0.0', {
        resourceId: id,
        attributes: {
          clerkUserId,
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

export const createCatalogMarker = makeContract({
  commandName: 'createCatalogMarker',
  payload: {
    id: CatalogMarker.primaryKey({ autogenerate: true }),
    label: primitives.text(),
  },
  mutations: Schema.Struct({
    created: CatalogMarker.createMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id, label } = payload;
    return Effect.all({
      created: CatalogMarker.create('1.0.0', {
        resourceId: id,
        attributes: { label },
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
    product: Product.replicateResourceMutation('1.0.0'),
    cartItem: CartItem.createMutation('2.0.0'),
  }),
  program: ({ payload }) => {
    const { id, cartId, product, quantity } = payload;
    return Effect.all({
      product: Product.replicateResource('1.0.0', {
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

export const updateCartItemQuantity = makeContract(
  {
    commandName: 'updateCartItemQuantity',
    payload: {
      cartItemId: CartItem.primaryKey({ autogenerate: false }),
      amount: primitives.integer(),
      unit: primitives.enum({ values: ['item', 'case'] }),
    },
    mutations: Schema.Struct({
      updated: CartItem.updateMutation('2.0.0'),
    }),
    program: ({ payload }) => {
      const { amount, cartItemId, unit } = payload;
      return Effect.all({
        updated: CartItem.update('2.0.0', {
          resourceId: cartItemId,
          attributes: { amount, unit },
        }),
      });
    },
    version: '2.0.0',
  },
  [
    {
      commandName: 'updateCartItemQuantity',
      payload: {
        cartItemId: CartItem.primaryKey({ autogenerate: false }),
        quantity: primitives.integer(),
      },
      version: '1.0.0',
      adaptPayload: ({ payload }) =>
        Effect.succeed({
          cartItemId: payload.cartItemId,
          amount: payload.quantity,
          unit: 'item',
        } satisfies Readonly<{
          cartItemId: typeof payload.cartItemId;
          amount: number;
          unit: 'item' | 'case';
        }>),
    },
  ],
);

export const removeFromCart = makeContract({
  commandName: 'removeFromCart',
  payload: {
    id: CartItem.primaryKey({ autogenerate: false }),
  },
  mutations: Schema.Struct({
    deleted: CartItem.deleteMutation('2.0.0'),
  }),
  program: ({ payload }) => {
    const { id } = payload;
    return Effect.all({
      deleted: CartItem.delete('2.0.0', {
        resourceId: id,
      }),
    });
  },
  version: '1.0.0',
});
