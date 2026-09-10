import { models, primitives } from '@zerospin/sdk/browser';

import { product } from './product';

export const productV1 = models.makeVersion(product, {
  attributes: {
    description: primitives.text(),
    name: primitives.text(),
    price: primitives.integer(),
  },
  indexes: [],
  version: '1.0.0',
});
