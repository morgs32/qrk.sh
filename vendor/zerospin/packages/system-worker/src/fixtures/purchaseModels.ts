import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { makeReplica } from '@zerospin/core/models/make/makeReplica';
import { makePurchaseFrontendModule } from '@zerospin/purchase/browser';
import { primitives } from '@zerospin/schema';
import { Schema } from 'effect';
const user = makeModelVersion(
  defineModel({ name: 'user', abbreviation: 'usr' }),
  {
    version: '1.0.0',
    attributes: { name: primitives.text() },
    indexes: [],
  },
);
const cart = makeModelVersion(
  defineModel({ name: 'cart', abbreviation: 'crt' }),
  {
    version: '1.0.0',
    attributes: {
      userId: primitives.ref({
        table: user.table,
        relation: 'user',
        inverse: 'cart',
        unique: true,
      }),
    },
    indexes: [],
  },
);
export const productSource = makeModelVersion(
  defineModel({ name: 'product', abbreviation: 'prd' }),
  {
    version: '1.0.0',
    attributes: {
      name: primitives.text(),
      price: primitives.integer(),
    },
    indexes: [],
  },
);
const product = makeReplica({
  sourceModel: productSource,
  serviceName: 'catalog',
  serviceVersion: '1.0.0',
});
const cartItem = makeModelVersion(
  defineModel({ name: 'cartItem', abbreviation: 'cit' }),
  {
    version: '1.0.0',
    attributes: {
      cartId: primitives.ref({
        table: cart.table,
        relation: 'cart',
        inverse: 'items',
      }),
      productId: primitives.ref({
        table: product.table,
        relation: 'product',
        inverse: 'cartItems',
      }),
      amount: primitives.integer(),
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
  identitySchema: purchaseIdentity,
  resolveUserId: ({ queryDb, identity }) =>
    queryDb.query.user
      .findMany()
      .sync()
      .find(user => user.id === identity.userId)?.id,
  readQuantity: item => item.amount,
});
