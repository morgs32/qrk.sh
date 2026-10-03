import * as sdk from '@zerospin/sdk/browser';

import { cartV1 } from '../cart/CartV1';
import { productV1 } from '../product/ProductV1';

import { cartItem } from './cartItem';

export const cartItemV1 = sdk.makeModelVersion(cartItem, {
  attributes: {
    cartId: sdk.primitives.ref({
      nullable: false,
      table: cartV1.table,
      relation: 'cart',
      inverse: 'items',
    }),
    productId: sdk.primitives.ref({
      nullable: false,
      table: productV1.table,
      relation: 'product',
      inverse: 'cartItems',
    }),
    amount: sdk.primitives.integer(),
  },
  indexes: [],
  version: '1.0.0',
});
