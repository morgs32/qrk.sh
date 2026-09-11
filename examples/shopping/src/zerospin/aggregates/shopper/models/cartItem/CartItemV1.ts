import * as sdk from '@zerospin/sdk/browser';

import { cartV1 } from '../cart/CartV1';
import { productReplicaV1 } from '../productReplica/ProductReplicaV1';

import { cartItem } from './cartItem';

export const cartItemV1 = sdk.makeModelVersion(cartItem, {
  attributes: {
    cartId: sdk.primitives.ref({
      table: cartV1.table,
      relation: 'cart',
      inverse: 'items',
    }),
    productId: sdk.primitives.ref({
      table: productReplicaV1.table,
      relation: 'product',
      inverse: 'cartItems',
    }),
  },
  indexes: [],
  version: '1.0.0',
});
