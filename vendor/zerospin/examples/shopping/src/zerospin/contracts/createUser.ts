import { makeContract, primitives } from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { User } from '../models/User';

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
