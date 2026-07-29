import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeServiceFrontendController } from '@zerospin/core/serviceFrontendController/makeServiceFrontendController';
import { Schema } from 'effect';

import {
  addToCart,
  createCart,
  removeFromCart,
  updateCartItemQuantity,
  updateUser,
} from './contracts';
import { Cart, CartItem, Product, User } from './models';

export const shopperFrontend = makeFrontendController({
  contracts: {
    addToCart,
    createCart,
    removeFromCart,
    updateCartItemQuantity,
    updateUser,
  },
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '1.0.0',
  systemName: 'shopping',
  models: {
    cart: Cart,
    cartItem: CartItem,
    product: Product,
    user: User,
  },
  signature: Schema.Struct({
    clerkUserId: Schema.String,
  }),
});

export const catalogFrontend = makeServiceFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  actorName: 'catalogViewer',
  frontendName: 'catalog',
  version: '1.0.0',
  models: {
    product: Product,
  },
  signature: Schema.Struct({
    viewerId: Schema.String,
  }),
});

export const frontends = {
  shopper: shopperFrontend,
  catalog: catalogFrontend,
};
