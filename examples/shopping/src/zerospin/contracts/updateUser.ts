import { makeContract, primitives } from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { User } from '../models/User';

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
