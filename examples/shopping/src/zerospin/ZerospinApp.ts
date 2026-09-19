import {
  makeAggregateFrontend,
  makeBackup,
  makeRuntime,
  makeServiceFrontend,
  makeSession,
} from '@zerospin/react';
import * as sdk from '@zerospin/sdk/browser';
import { Effect, Layer, Redacted, Schema } from 'effect';

import { addToCartV2 } from './aggregates/shopper/contracts/addToCart/AddToCartV2';
import { createCartV1 } from './aggregates/shopper/contracts/createCart/CreateCartV1';
import { createUserV1 } from './aggregates/shopper/contracts/createUser/CreateUserV1';
import { removeFromCartV2 } from './aggregates/shopper/contracts/removeFromCart/removeFromCartV2';
import { updateCartItemQuantityV1 } from './aggregates/shopper/contracts/updateCartItemQuantity/UpdateCartItemQuantityV1';
import { updateUserV1 } from './aggregates/shopper/contracts/updateUser/UpdateUserV1';
import { CurrentUser } from './aggregates/shopper/CurrentUser';
import { cartV1 } from './aggregates/shopper/models/cart/CartV1';
import { cartItemV2 } from './aggregates/shopper/models/cartItem/CartItemV2';
import { productReplicaV1 } from './aggregates/shopper/models/productReplica/ProductReplicaV1';
import {
  ClerkUserIdSchema,
  userV1,
} from './aggregates/shopper/models/user/UserV1';
import { productV1 } from './services/app/models/product/ProductV1';

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

export const runtime = makeRuntime({ layer: applicationLayer });

/** Eager backup — client startup only, never during React render. */
export const backup = makeBackup();

export const Shopper = makeAggregateFrontend({
  authenticationSchema: Schema.Struct({
    aggregateId: Schema.Literal('acct_1'),
    clerkUserId: ClerkUserIdSchema,
  }),
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
  models: {
    cart: cartV1,
    cartItem: cartItemV2,
    product: productReplicaV1,
    user: userV1,
  },
  guardLayer: ({ db, authentication }) =>
    Layer.succeed(
      CurrentUser,
      Effect.gen(function* () {
        if (authentication === null) {
          return yield* new sdk.ZerospinError({
            code: 'authentication-required',
            message: 'This command requires an authenticated user',
          });
        }
        const found = db.query.user
          .findFirst({
            where: { clerkUserId: { eq: authentication.clerkUserId } },
          })
          .sync();
        if (found === undefined) {
          return yield* new sdk.ZerospinError({
            code: 'current-user-not-found',
            message: 'The authenticated User has not been provisioned',
          });
        }
        return found;
      }),
    ),
});

export const Catalog = makeServiceFrontend({
  authenticationSchema: Schema.Struct({ clerkUserId: ClerkUserIdSchema }),
  serviceVersion: '1.0.0',
  serviceName: 'app',
  name: 'appFrontend',
  models: {
    product: productV1,
  },
});

export const shopperSession = makeSession({
  frontend: Shopper,
  runtime,
  backup,
  systemName: 'shopping',
});

export const catalogSession = makeSession({
  frontend: Catalog,
  runtime,
  backup,
  systemName: 'shopping',
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void (async () => {
      await shopperSession.dispose();
      await catalogSession.dispose();
      await backup.dispose();
      await runtime.dispose();
    })();
  });
}
