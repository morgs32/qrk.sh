import * as sdk from '@zerospin/sdk/browser';

import { cartItemV2 } from './CartItemV2';

export const cartItemV3 = sdk.upgradeModelVersion(cartItemV2, {
  attributes: {
    amount: null,
    quantity: sdk.primitives.integer(),
  },
  version: '3.0.0',
});
