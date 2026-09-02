import { makeContract, primitives } from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { Product } from '../models/Product';

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
