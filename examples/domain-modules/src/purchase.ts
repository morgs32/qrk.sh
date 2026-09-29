import { makePurchaseFrontendModule } from '@zerospin/purchase/browser';
import * as sdk from '@zerospin/sdk/browser';
import { Schema } from 'effect';
const user = sdk.makeModelVersion(
  sdk.defineModel({ name: 'user', abbreviation: 'usr' }),
  {
    version: '1.0.0',
    attributes: { name: sdk.primitives.text() },
    indexes: [],
  },
);
const cart = sdk.makeModelVersion(
  sdk.defineModel({ name: 'cart', abbreviation: 'crt' }),
  {
    version: '1.0.0',
    attributes: {
      userId: sdk.primitives.ref({
        table: user.table,
        relation: 'user',
        inverse: 'cart',
        unique: true,
      }),
    },
    indexes: [],
  },
);
const productSource = sdk.makeModelVersion(
  sdk.defineModel({ name: 'product', abbreviation: 'prd' }),
  {
    version: '1.0.0',
    attributes: {
      name: sdk.primitives.text(),
      price: sdk.primitives.integer(),
    },
    indexes: [],
  },
);
const product = sdk.makeReplica({
  sourceModel: productSource,
  serviceName: 'catalog',
  serviceVersion: '1.0.0',
});
const cartItem = sdk.makeModelVersion(
  sdk.defineModel({ name: 'cartItem', abbreviation: 'cit' }),
  {
    version: '1.0.0',
    attributes: {
      cartId: sdk.primitives.ref({
        table: cart.table,
        relation: 'cart',
        inverse: 'items',
      }),
      productId: sdk.primitives.ref({
        table: product.table,
        relation: 'product',
        inverse: 'cartItems',
      }),
      amount: sdk.primitives.integer(),
    },
    indexes: [],
  },
);
export const purchaseHost = { user, cart, cartItem, product };
export const purchaseIdentity = Schema.Struct({
  aggregateId: Schema.String,
  userId: Schema.String,
});
export const purchaseFrontend = makePurchaseFrontendModule({
  models: purchaseHost,
  claimsSchema: purchaseIdentity,
  resolveUserId: ({ db, claims }) =>
    db.query.user
      .findMany()
      .sync()
      .find(user => user.id === claims.userId)?.id,
  readQuantity: item => item.amount,
});
