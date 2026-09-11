import { makeZerospinApp } from '@zerospin/react';
import * as sdk from '@zerospin/sdk/browser';
import { Layer, Redacted } from 'effect';

import { addToCartV2 } from './aggregates/shopper/contracts/addToCart/AddToCartV2';
import { createCartV1 } from './aggregates/shopper/contracts/createCart/CreateCartV1';
import { createUserV1 } from './aggregates/shopper/contracts/createUser/CreateUserV1';
import { removeFromCartV2 } from './aggregates/shopper/contracts/removeFromCart/removeFromCartV2';
import { updateCartItemQuantityV1 } from './aggregates/shopper/contracts/updateCartItemQuantity/UpdateCartItemQuantityV1';
import { updateUserV1 } from './aggregates/shopper/contracts/updateUser/UpdateUserV1';
import { cartV1 } from './aggregates/shopper/models/cart/CartV1';
import { cartItemV2 } from './aggregates/shopper/models/cartItem/CartItemV2';
import { productReplicaV1 } from './aggregates/shopper/models/productReplica/ProductReplicaV1';
import { userV1 } from './aggregates/shopper/models/user/UserV1';
import type { shopperV2 } from './aggregates/shopper/ShopperV2';
import type { appV1 } from './services/app/AppV1';
import { productV1 } from './services/app/models/product/ProductV1';
import { signature } from './signature';

const ShopperFrontendV2 = sdk.makeFrontendController({
  aggregateVersion: '2.0.0',
  contracts: {
    addToCart: { contract: addToCartV2 },
    createCart: { contract: createCartV1 },
    createUser: { contract: createUserV1 },
    removeFromCart: { contract: removeFromCartV2 },
    updateCartItemQuantity: { contract: updateCartItemQuantityV1 },
    updateUser: { contract: updateUserV1 },
  },
  aggregateName: 'shopper',
  name: 'shopperFrontend',
  systemName: 'shopping',
  models: {
    cart: cartV1,
    cartItem: cartItemV2,
    product: productReplicaV1,
    user: userV1,
  },
}) satisfies sdk.IAggregateFrontend<typeof shopperV2>;

const AppFrontendV1 = sdk.makeFrontendController({
  systemName: 'shopping',
  serviceVersion: '1.0.0',
  serviceName: 'app',
  name: 'appFrontend',
  models: {
    product: productV1,
  },
}) satisfies sdk.IServiceFrontend<typeof appV1>;

const zerospinApiUrl = import.meta.env.VITE_ZEROSPIN_API_URL;
const zerospinPublishableKey = import.meta.env.VITE_ZEROSPIN_PUBLISHABLE_KEY;

if (!zerospinApiUrl) {
  throw new Error('Set VITE_ZEROSPIN_API_URL for the shopping app.');
}

if (!zerospinPublishableKey) {
  throw new Error('Set VITE_ZEROSPIN_PUBLISHABLE_KEY for the shopping app.');
}

const applicationLayer = Layer.mergeAll(
  Layer.succeed(sdk.ZerospinApiUrl, zerospinApiUrl),
  Layer.succeed(sdk.PublishableKey, Redacted.make(zerospinPublishableKey)),
);

export const ZerospinApp = makeZerospinApp({
  systemName: 'shopping',
  authentication: {
    version: signature.version,
    signature: signature.signature,
  },
  frontends: {
    shopperFrontend: ShopperFrontendV2,
    appFrontend: AppFrontendV1,
  },
  layer: applicationLayer,
});
