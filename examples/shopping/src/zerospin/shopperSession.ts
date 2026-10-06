import { makeServiceSession } from '@zerospin/browser';

import { applicationLayer } from './applicationLayer';
import { clerkCredentialsSchema, userClaims } from './claims';
import { addToCartV1 } from './services/marketplace/contracts/addToCart/AddToCartV1';
import { createCartV1 } from './services/marketplace/contracts/createCart/CreateCartV1';
import { removeFromCartV1 } from './services/marketplace/contracts/removeFromCart/RemoveFromCartV1';
import { updateCartItemQuantityV1 } from './services/marketplace/contracts/updateCartItemQuantity/UpdateCartItemQuantityV1';
import { cartV1 } from './services/marketplace/models/cart/CartV1';
import { cartItemV1 } from './services/marketplace/models/cartItem/CartItemV1';
import { productV1 } from './services/marketplace/models/product/ProductV1';

export const shopperSession = makeServiceSession({
  sharedWorker: ({ name }) =>
    new SharedWorker(new URL('./zerospin.worker.ts', import.meta.url), {
      type: 'module',
      name,
    }),
  claimsSchema: userClaims,
  credentialsSchema: clerkCredentialsSchema,
  actorName: 'shopper',
  actorVersion: '1.0.0',
  serviceName: 'marketplace',
  serviceVersion: '1.0.0',
  sessionName: 'shopperSession',
  models: { cart: cartV1, cartItem: cartItemV1, product: productV1 },
  contracts: {
    createCart: createCartV1,
    addToCart: addToCartV1,
    removeFromCart: removeFromCartV1,
    updateCartItemQuantity: updateCartItemQuantityV1,
  },
  layer: applicationLayer,
  systemName: 'shopping',
});
