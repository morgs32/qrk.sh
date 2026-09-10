import { models, primitives } from '@zerospin/sdk/browser';

import { cartItemV2 } from './CartItemV2';

export const cartItemV3 = models.upgradeVersion(cartItemV2, {
  attributes: {
    amount: null,
    quantity: primitives.integer(),
  },
  version: '3.0.0',
});
