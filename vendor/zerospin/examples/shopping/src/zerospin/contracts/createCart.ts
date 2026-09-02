import { makeContract, primitives } from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { Cart } from '../models/Cart';
import { User } from '../models/User';

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
