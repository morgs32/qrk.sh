import { makeContract, primitives } from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { CatalogMarker } from '../models/CatalogMarker';

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
