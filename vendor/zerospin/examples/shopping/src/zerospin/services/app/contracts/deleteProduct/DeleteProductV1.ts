import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { product } from '../../models/product/product';
import { productV1 } from '../../models/product/ProductV1';

import { deleteProduct } from './deleteProduct';

export const deleteProductV1 = sdk.makeContractVersion(deleteProduct, {
  payload: {
    id: sdk.primitives.foreignKey({ abbreviation: product.abbreviation }),
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
