import { makeContract, primitives } from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { Product } from '../models/Product';

export const deleteProduct = makeContract({
  commandName: 'deleteProduct',
  payload: {
    id: Product.primaryKey({ autogenerate: false }),
  },
  mutations: Schema.Struct({
    deleted: Product.deleteMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id } = payload;
    return Effect.all({
      deleted: Product.delete('1.0.0', {
        resourceId: id,
      }),
    });
  },
  version: '1.0.0',
});
