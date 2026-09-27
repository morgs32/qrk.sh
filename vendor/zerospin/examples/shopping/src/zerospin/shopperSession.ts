import { makeSession } from '@zerospin/browser';

import { addToCartV2 } from './aggregates/shopper/contracts/addToCart/AddToCartV2';
import { createCartV1 } from './aggregates/shopper/contracts/createCart/CreateCartV1';
import { removeFromCartV2 } from './aggregates/shopper/contracts/removeFromCart/removeFromCartV2';
import { updateCartItemQuantityV1 } from './aggregates/shopper/contracts/updateCartItemQuantity/UpdateCartItemQuantityV1';
import { updateUserV1 } from './aggregates/shopper/contracts/updateUser/UpdateUserV1';
import { fulfillmentFrontend } from './aggregates/shopper/fulfillmentFrontend';
import { cartV1 } from './aggregates/shopper/models/cart/CartV1';
import { cartItemV2 } from './aggregates/shopper/models/cartItem/CartItemV2';
import { productReplicaV1 } from './aggregates/shopper/models/productReplica/ProductReplicaV1';
import { userV1 } from './aggregates/shopper/models/user/UserV1';
import { purchaseFrontend } from './aggregates/shopper/purchaseFrontend';
import { applicationLayer } from './applicationLayer';
import { clerkCredentialsSchema, shopperIdentitySchema } from './identities';

export const shopperSession = makeSession({
  identitySchema: shopperIdentitySchema,
  credentialsSchema: clerkCredentialsSchema,
  kind: 'aggregate',
  actorName: 'shopper',
  actorVersion: '2.0.0',
  aggregateVersion: '2.0.0',
  aggregateName: 'shopper',
  sessionName: 'shopperSession',
  modules: { purchase: purchaseFrontend, fulfillment: fulfillmentFrontend },
  models: {
    cart: cartV1,
    cartItem: cartItemV2,
    product: productReplicaV1,
    user: userV1,
  },
  contracts: {
    addToCart: addToCartV2,
    createCart: createCartV1,
    removeFromCart: removeFromCartV2,
    updateCartItemQuantity: updateCartItemQuantityV1,
    updateUser: updateUserV1,
  },
  automations: {},
  layer: applicationLayer,
  systemName: 'shopping',
});
