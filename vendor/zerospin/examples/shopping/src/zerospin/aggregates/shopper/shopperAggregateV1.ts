import * as sdk from '@zerospin/sdk';

import { provisionerV1 } from './actors/provisionerV1';
import { shopperActorV1 } from './actors/shopperActorV1';
import { addToCartV1 } from './contracts/addToCart/AddToCartV1';
import { createCartV1 } from './contracts/createCart/CreateCartV1';
import { createUserV1 } from './contracts/createUser/CreateUserV1';
import { removeFromCartV1 } from './contracts/removeFromCart/RemoveFromCartV1';
import { updateUserV1 } from './contracts/updateUser/UpdateUserV1';
import { cartV1 } from './models/cart/CartV1';
import { cartItemV1 } from './models/cartItem/CartItemV1';
import { productReplicaV1 } from './models/productReplica/ProductReplicaV1';
import { userV1 } from './models/user/UserV1';
import { purchaseFrontend } from './purchaseFrontend';
import { shopper } from './shopper';

export const shopperAggregateV1 = sdk.makeAggregateVersion(shopper, {
  version: '1.0.0',
  modules: {
    purchase: {
      models: purchaseFrontend.models,
      contracts: {},
    },
  },
  models: {
    user: userV1,
    cart: cartV1,
    cartItem: cartItemV1,
    product: productReplicaV1,
  },
  contracts: {
    createUser: createUserV1,
    updateUser: updateUserV1,
    createCart: createCartV1,
    addToCart: addToCartV1,
    removeFromCart: removeFromCartV1,
  },
  actors: {
    provisioner: provisionerV1,
    shopper: shopperActorV1,
  },
});
