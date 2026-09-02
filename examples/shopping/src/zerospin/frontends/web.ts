import { makeFrontendController } from '@zerospin/sdk/browser';

import { addToCart } from '../contracts/addToCart';
import { createCart } from '../contracts/createCart';
import { createUser } from '../contracts/createUser';
import { removeFromCart } from '../contracts/removeFromCart';
import { updateCartItemQuantity } from '../contracts/updateCartItemQuantity';
import { updateUser } from '../contracts/updateUser';
import { Cart } from '../models/Cart';
import { CartItem } from '../models/CartItem';
import { ProductReplica } from '../models/ProductReplica';
import { User } from '../models/User';

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
    product: ProductReplica,
    user: User,
  },
});
