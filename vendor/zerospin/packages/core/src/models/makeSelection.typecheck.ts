import type { IDb } from '../drizzle/types.ts';

import { makeModel } from './makeModel.ts';
import { applySelection, makeSelection } from './makeSelection.ts';
import { primitives } from './primitives.ts';

const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      name: primitives.text({ nullable: true }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const Cart = makeModel(
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

const CartItem = makeModel(
  {
    abbreviation: 'cit',
    modelName: 'cartItem',
    attributes: {
      cartId: primitives.ref({
        table: Cart.table,
        relation: 'cart',
        inverse: 'items',
      }),
      productId: primitives.opaqueId({ abbreviation: 'prd' }),
      quantity: primitives.integer(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const testUserId = 'usr_typecheck0001' as string;

void makeSelection({
  model: CartItem,
  where: ({ userId }) => ({
    cart: {
      user: {
        id: userId,
      },
    },
  }),
});

void makeSelection({
  model: User,
  where: () => ({
    cart: {},
  }),
});

// @ts-expect-error CoreTypeError — unknown scalar where key
void makeSelection({
  model: CartItem,
  where: () => ({
    notAColumn: true,
  }),
});

declare const cartItemSelection: ReturnType<
  typeof makeSelection<typeof CartItem>
>;

// @ts-expect-error CoreTypeError — userId is required
void applySelection({
  db: null as IDb,
  models: { cart: Cart, cartItem: CartItem, user: User },
  selection: cartItemSelection,
});

void applySelection({
  db: null as IDb,
  models: { cart: Cart, cartItem: CartItem, user: User },
  selection: cartItemSelection,
  userId: testUserId,
});
