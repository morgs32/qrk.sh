import { makeContract, primitives } from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { CartItem } from '../models/CartItem';

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
