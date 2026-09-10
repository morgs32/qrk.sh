import { contracts, primitives } from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { product } from '../../models/product/product';
import { productV1 } from '../../models/product/ProductV1';

import { createProduct } from './createProduct';

export const createProductV1 = contracts.makeVersion(createProduct, {
  payload: {
    id: primitives.foreignKey({ abbreviation: product.abbreviation }),
    description: primitives.text(),
    name: primitives.text(),
    price: primitives.integer(),
  },

  models: { product: productV1 },
  program: ({ payload, models }) => {
    const { description, id, name, price } = payload;
    return Effect.all({
      created: models.product.create({
        resourceId: id,
        attributes: { description, name, price },
      }),
    });
  },
  version: '1.0.0',
});
