import * as sdk from '@zerospin/sdk/browser';

import { cartItemV1 } from './CartItemV1';

export const cartItemV2 = sdk.upgradeModelVersion(cartItemV1, {
  attributes: {
    amount: sdk.primitives.integer(),
  },
  version: '2.0.0',
});
