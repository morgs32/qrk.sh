import { makeFulfillmentGuards } from '@zerospin/fulfillment/server';
import * as sdk from '@zerospin/sdk';

import { provisionerV1 } from './actors/provisionerV1';
import { shopperActorV2 } from './actors/shopperActorV2';
import { addToCartV2 } from './contracts/addToCart/AddToCartV2';
import { createCartV1 } from './contracts/createCart/CreateCartV1';
import { createUserV1 } from './contracts/createUser/CreateUserV1';
import { removeFromCartV2 } from './contracts/removeFromCart/removeFromCartV2';
import { updateCartItemQuantityV1 } from './contracts/updateCartItemQuantity/UpdateCartItemQuantityV1';
import { updateUserV1 } from './contracts/updateUser/UpdateUserV1';
import { fulfillment } from './fulfillment';
import { cartV1 } from './models/cart/CartV1';
import { cartItemV2 } from './models/cartItem/CartItemV2';
import { productReplicaV1 } from './models/productReplica/ProductReplicaV1';
import { userV1 } from './models/user/UserV1';
import { purchase } from './purchase';
import { shopperAggregateV1 } from './shopperAggregateV1';

export const shopperAggregateV2 = sdk.upgradeAggregateVersion(
  shopperAggregateV1,
  {
    version: '2.0.0',
    modules: { purchase, fulfillment },
    models: {
      user: userV1,
      cart: cartV1,
      cartItem: cartItemV2,
      product: productReplicaV1,
    },
    contracts: {
      createUser: createUserV1,
      updateUser: updateUserV1,
      createCart: createCartV1,
      addToCart: addToCartV2,
      removeFromCart: removeFromCartV2,
      updateCartItemQuantity: updateCartItemQuantityV1,
    },
    actors: { provisioner: provisionerV1, shopper: shopperActorV2 },
    guards: { shopper: makeFulfillmentGuards(fulfillment) },
  },
);
