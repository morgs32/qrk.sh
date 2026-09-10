import { contracts, primitives } from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { product } from '../../models/product/product';
import { productV1 } from '../../models/product/ProductV1';

import { deleteProduct } from './deleteProduct';

export const deleteProductV1 = contracts.makeVersion(deleteProduct, {
  payload: {
    id: primitives.foreignKey({ abbreviation: product.abbreviation }),
  },

  models: { product: productV1 },
  program: ({ payload, models }) => {
    const { id } = payload;
    return Effect.all({
      deleted: models.product.delete({
        resourceId: id,
      }),
    });
  },
  version: '1.0.0',
});
