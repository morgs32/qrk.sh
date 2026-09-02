import { makeModel, primitives } from '@zerospin/sdk/browser';

// This service-owned row is intentionally absent from catalogFrontend. The
// workerd acceptance flow mutates it to prove an irrelevant service change
// advances the source serviceIndex without allocating a finalized frontend
// index.
export const CatalogMarker = makeModel(
  {
    abbreviation: 'cmk',
    modelName: 'catalogMarker',
    attributes: {
      label: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);
