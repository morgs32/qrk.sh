import * as sdk from '@zerospin/sdk/browser';

import { product } from './product';

export const productV1 = sdk.makeModelVersion(product, {
  attributes: {
    description: sdk.primitives.text(),
    name: sdk.primitives.text(),
    price: sdk.primitives.integer(),
  },
  indexes: [],
  version: '1.0.0',
});
