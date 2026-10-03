import * as sdk from '@zerospin/sdk/browser';

import { cart } from './cart';

export const cartV1 = sdk.makeModelVersion(cart, {
  attributes: { userId: sdk.primitives.text({ unique: true }) },
  indexes: [],
  version: '1.0.0',
});
