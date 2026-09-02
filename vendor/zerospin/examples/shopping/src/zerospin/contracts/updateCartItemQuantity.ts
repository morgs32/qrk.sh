import { makeContract, primitives } from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { CartItem } from '../models/CartItem';

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
