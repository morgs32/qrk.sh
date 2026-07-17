import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { Schema } from 'effect';

import {
  addToCart,
  createCart,
  createUser,
  removeFromCart,
  updateCartItemQuantity,
  updateUser,
} from './contracts';
import { Cart, CartItem, Product, User } from './models';

export const shopperFrontend = makeFrontendController({
  contracts: {
    addToCart,
    createCart,
    createUser,
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

export const frontends = {
  shopper: shopperFrontend,
};
