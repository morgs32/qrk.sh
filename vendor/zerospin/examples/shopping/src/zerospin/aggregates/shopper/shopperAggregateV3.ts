import { makeFulfillmentGuards } from '@zerospin/fulfillment/server';
import { makePurchaseGuards } from '@zerospin/purchase/server';
import * as sdk from '@zerospin/sdk';

import { provisionerV1 } from './actors/provisionerV1';
import { shopperActorV3 } from './actors/shopperActorV3';
import { addToCartV3 } from './contracts/addToCart/AddToCartV3';
import { createCartV1 } from './contracts/createCart/CreateCartV1';
import { createUserV1 } from './contracts/createUser/CreateUserV1';
import { removeFromCartV3 } from './contracts/removeFromCart/RemoveFromCartV3';
import { updateCartItemQuantityV3 } from './contracts/updateCartItemQuantity/UpdateCartItemQuantityV3';
import { updateUserV1 } from './contracts/updateUser/UpdateUserV1';
import { fulfillmentV3 as fulfillment } from './fulfillmentV3';
import { cartV1 } from './models/cart/CartV1';
import { cartItemV3 } from './models/cartItem/CartItemV3';
import { productReplicaV1 } from './models/productReplica/ProductReplicaV1';
import { userV1 } from './models/user/UserV1';
import { purchaseV3 as purchase } from './purchaseV3';
import { shopperAggregateV2 } from './shopperAggregateV2';

export const shopperAggregateV3 = sdk.upgradeAggregateVersion(
  shopperAggregateV2,
  {
    version: '3.0.0',
    modules: { purchase, fulfillment },
    models: {
      user: userV1,
      cart: cartV1,
      cartItem: cartItemV3,
      product: productReplicaV1,
    },
    contracts: {
      createUser: createUserV1,
      updateUser: updateUserV1,
      createCart: createCartV1,
      addToCart: addToCartV3,
      removeFromCart: removeFromCartV3,
      updateCartItemQuantity: updateCartItemQuantityV3,
    },
    actors: { provisioner: provisionerV1, shopper: shopperActorV3 },
    guards: {
      shopper: {
        ...makePurchaseGuards(purchase),
        ...makeFulfillmentGuards(fulfillment),
      },
    },
  },
);
