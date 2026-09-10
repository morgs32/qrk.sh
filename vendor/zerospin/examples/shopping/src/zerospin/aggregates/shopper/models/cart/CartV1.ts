import { models, primitives } from '@zerospin/sdk/browser';

import { userV1 } from '../user/UserV1';

import { cart } from './cart';

export const cartV1 = models.makeVersion(cart, {
  attributes: {
    userId: primitives.ref({
      table: userV1.table,
      relation: 'user',
      inverse: 'cart',
      unique: true,
    }),
  },
  indexes: [],
  version: '1.0.0',
});
