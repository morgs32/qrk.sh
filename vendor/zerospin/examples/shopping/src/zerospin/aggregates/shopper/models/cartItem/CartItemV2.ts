import { models, primitives } from '@zerospin/sdk/browser';

import { cartItemV1 } from './CartItemV1';

export const cartItemV2 = models.upgradeVersion(cartItemV1, {
  attributes: {
    amount: primitives.integer(),
  },
  version: '2.0.0',
});
