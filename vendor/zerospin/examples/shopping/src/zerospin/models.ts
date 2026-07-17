import { makeModel } from '@zerospin/core/models/makeModel';
import { makeServiceModel } from '@zerospin/core/models/makeServiceModel';
import { primitives } from '@zerospin/core/models/primitives';

export const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      actorId: primitives.opaqueId({ abbreviation: 'actr', unique: true }),
      name: primitives.text({ nullable: true }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

export const Product = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'prd',
    modelName: 'product',
    attributes: {
      description: primitives.text(),
      name: primitives.text(),
      price: primitives.integer(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

export const Cart = makeModel(
  {
    abbreviation: 'crt',
    modelName: 'cart',
    attributes: {
      userId: primitives.ref({
        table: User.table,
        relation: 'user',
        inverse: 'cart',
        unique: true,
      }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

export const CartItem = makeModel(
  {
    abbreviation: 'cit',
    modelName: 'cartItem',
    attributes: {
      cartId: primitives.ref({
        table: Cart.table,
        relation: 'cart',
        inverse: 'items',
      }),
      productId: primitives.ref({
        table: Product.table,
        relation: 'product',
        inverse: 'cartItems',
      }),
      quantity: primitives.integer(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

export const models = {
  cart: Cart,
  cartItem: CartItem,
  product: Product,
  user: User,
};
