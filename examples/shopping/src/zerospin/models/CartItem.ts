import { makeModel, primitives } from '@zerospin/sdk/browser';

import { Cart } from './Cart';
import { ProductReplica } from './ProductReplica';

export const CartItem = makeModel({
  abbreviation: 'cit',
  modelName: 'cartItem',
  attributes: {
    cartId: primitives.ref({
      table: Cart.table,
      relation: 'cart',
      inverse: 'items',
    }),
    productId: primitives.ref({
      table: ProductReplica.table,
      relation: 'product',
      inverse: 'cartItems',
    }),
    amount: primitives.integer(),
    unit: primitives.enum({ values: ['item', 'case'] }),
  },
  indexes: [],
  version: '2.0.0',
});
