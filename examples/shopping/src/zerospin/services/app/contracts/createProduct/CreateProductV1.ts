import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { product } from '../../models/product/product';
import { productV1 } from '../../models/product/ProductV1';

import { createProduct } from './createProduct';

export const createProductV1 = sdk.makeContractVersion(createProduct, {
  payload: {
    id: sdk.primitives.foreignKey({ abbreviation: product.abbreviation }),
    description: sdk.primitives.text(),
    name: sdk.primitives.text(),
    price: sdk.primitives.integer(),
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
