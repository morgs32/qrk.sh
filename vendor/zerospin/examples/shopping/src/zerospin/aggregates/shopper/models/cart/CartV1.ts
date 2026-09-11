import * as sdk from '@zerospin/sdk/browser';

import { userV1 } from '../user/UserV1';

import { cart } from './cart';

export const cartV1 = sdk.makeModelVersion(cart, {
  attributes: {
    userId: sdk.primitives.ref({
      table: userV1.table,
      relation: 'user',
      inverse: 'cart',
      unique: true,
    }),
  },
  indexes: [],
  version: '1.0.0',
});
