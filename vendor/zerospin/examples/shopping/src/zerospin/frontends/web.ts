import { makeFrontendController } from '@zerospin/sdk/browser';

import {
  addToCart,
  createCart,
  createUser,
  removeFromCart,
  updateCartItemQuantity,
  updateUser,
} from '../contracts';
import { Cart, CartItem, Product, User } from '../models';

export const web = makeFrontendController({
  contracts: {
    addToCart,
    createCart,
    createUser,
    removeFromCart,
    updateCartItemQuantity,
    updateUser,
  },
  aggregateName: 'shopper',
  frontendName: 'web',
  systemName: 'shopping',
  models: {
    cart: Cart,
    cartItem: CartItem,
    product: Product,
    user: User,
  },
});
