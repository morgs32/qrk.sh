import { makeModel, primitives } from '@zerospin/sdk/browser';

export const Product = makeModel(
  {
    abbreviation: 'prd',
    modelName: 'product',
    attributes: {
      description: primitives.text(),
      name: primitives.text(),
      price: primitives.integer(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);
