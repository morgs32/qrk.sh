import { makeModel, makeServiceModel, primitives } from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

export const ClerkUserIdSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.brand('ClerkUserId'),
);

export type IClerkUserId = Schema.Schema.Type<typeof ClerkUserIdSchema>;

export const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      clerkUserId: primitives.text({ unique: true }),
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

// This service-owned row is intentionally absent from catalogFrontend. The
// workerd acceptance flow mutates it to prove an irrelevant service change
// advances the source cursor without emitting a frontend block.
export const CatalogMarker = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'cmk',
    modelName: 'catalogMarker',
    attributes: {
      label: primitives.text(),
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
      amount: primitives.integer(),
      unit: primitives.enum({ values: ['item', 'case'] }),
    },
    indexes: [],
    version: '2.0.0',
  },
  [
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
      adaptResource: ({ resource }) =>
        Effect.succeed({
          id: resource.id,
          modelName: resource.modelName,
          createdAt: resource.createdAt,
          updatedAt: resource.updatedAt,
          version: '1.0.0',
          cartId: resource.cartId,
          productId: resource.productId,
          quantity:
            resource.unit === 'case' ? resource.amount * 12 : resource.amount,
        }),
    },
  ],
);

export const models = {
  catalogMarker: CatalogMarker,
  cart: Cart,
  cartItem: CartItem,
  product: Product,
  user: User,
};
