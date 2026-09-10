import { aggregates, makeSelection } from '@zerospin/sdk';

import { appV1 } from '../../services/app/AppV1';

import { addToCartV1 } from './contracts/addToCart/AddToCartV1';
import { createCartV1 } from './contracts/createCart/CreateCartV1';
import { createUserV1 } from './contracts/createUser/CreateUserV1';
import { removeFromCartV1 } from './contracts/removeFromCart/RemoveFromCartV1';
import { updateUserV1 } from './contracts/updateUser/UpdateUserV1';
import { cartV1 } from './models/cart/CartV1';
import { cartItemV1 } from './models/cartItem/CartItemV1';
import { productReplicaV1 } from './models/productReplica/ProductReplicaV1';
import { userV1, type IClerkUserId } from './models/user/UserV1';
import { shopper } from './shopper';

export const shopperV1 = aggregates.makeVersion(shopper, {
  services: { app: appV1 },
  version: '1.0.0',
  models: {
    user: userV1,
    cart: cartV1,
    cartItem: cartItemV1,
    product: productReplicaV1,
  },
  contracts: {
    addToCart: { contract: addToCartV1 },
    createCart: { contract: createCartV1 },
    createUser: { contract: createUserV1 },
    removeFromCart: { contract: removeFromCartV1 },
    updateUser: { contract: updateUserV1 },
  },
  selections: {
    user: makeSelection({
      model: userV1,
      where: ({ userId }: { userId: IClerkUserId }) => ({
        clerkUserId: userId,
      }),
    }),
    cart: makeSelection({
      model: cartV1,
      where: ({ userId }: { userId: IClerkUserId }) => ({
        user: { clerkUserId: userId },
      }),
    }),
    cartItem: makeSelection({
      model: cartItemV1,
      where: ({ userId }: { userId: IClerkUserId }) => ({
        cart: { user: { clerkUserId: userId } },
      }),
    }),
    product: makeSelection({
      model: productReplicaV1,
      where: ({ userId }: { userId: IClerkUserId }) => ({
        cartItems: {
          cart: { user: { clerkUserId: userId } },
        },
      }),
    }),
  },
});
