import { models, primitives } from '@zerospin/sdk/browser';

import { cartV1 } from '../cart/CartV1';
import { productReplicaV1 } from '../productReplica/ProductReplicaV1';

import { cartItem } from './cartItem';

export const cartItemV1 = models.makeVersion(cartItem, {
  attributes: {
    cartId: primitives.ref({
      table: cartV1.table,
      relation: 'cart',
      inverse: 'items',
    }),
    productId: primitives.ref({
      table: productReplicaV1.table,
      relation: 'product',
      inverse: 'cartItems',
    }),
  },
  indexes: [],
  version: '1.0.0',
});
