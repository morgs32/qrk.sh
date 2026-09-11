import { RoutePattern } from '@remix-run/route-pattern';
import * as sdk from '@zerospin/sdk';
import { Effect, Layer, Schema } from 'effect';

import { appV1 } from '../../services/app/AppV1';

import { addToCartV1 } from './contracts/addToCart/AddToCartV1';
import { createCartV1 } from './contracts/createCart/CreateCartV1';
import { createUserV1 } from './contracts/createUser/CreateUserV1';
import { removeFromCartV1 } from './contracts/removeFromCart/RemoveFromCartV1';
import { updateUserV1 } from './contracts/updateUser/UpdateUserV1';
import { CurrentUser } from './CurrentUser';
import { cartV1 } from './models/cart/CartV1';
import { cartItemV1 } from './models/cartItem/CartItemV1';
import { productReplicaV1 } from './models/productReplica/ProductReplicaV1';
import {
  ClerkUserIdSchema,
  userV1,
  type IClerkUserId,
} from './models/user/UserV1';
import { shopper } from './shopper';

export const shopperV1 = sdk.makeAggregateVersion(shopper, {
  authentication: {
    signatureSchema: Schema.Struct({ clerkUserId: ClerkUserIdSchema }),
    authenticationSchema: Schema.Struct({
      aggregateId: Schema.Literal('acct_1'),
      clerkUserId: ClerkUserIdSchema,
    }),
    selectionSchema: Schema.Struct({ clerkUserId: ClerkUserIdSchema }),
    pattern: RoutePattern.parse('/:clerkUserId'),
    authenticate: ({ signature, executeCommand }) =>
      Effect.gen(function* () {
        const result = yield* executeCommand({
          aggregateId: 'acct_1',
          contract: createUserV1,
          payload: {
            id: yield* sdk.makeId(userV1),
            clerkUserId: signature.clerkUserId,
          },
        });
        if (
          result.failure !== null &&
          result.failure.code !== 'user-clerk-identity-already-exists'
        ) {
          return yield* new sdk.ZerospinError(result.failure);
        }
        return {
          aggregateId: 'acct_1',
          clerkUserId: signature.clerkUserId,
        } satisfies { aggregateId: 'acct_1'; clerkUserId: IClerkUserId };
      }),
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
    user: sdk.makeSelection({
      model: userV1,
      where: ({
        authentication,
      }: {
        authentication: { clerkUserId: IClerkUserId };
      }) => ({
        clerkUserId: authentication.clerkUserId,
      }),
    }),
    cart: sdk.makeSelection({
      model: cartV1,
      where: ({
        authentication,
      }: {
        authentication: { clerkUserId: IClerkUserId };
      }) => ({
        user: { clerkUserId: authentication.clerkUserId },
      }),
    }),
    cartItem: sdk.makeSelection({
      model: cartItemV1,
      where: ({
        authentication,
      }: {
        authentication: { clerkUserId: IClerkUserId };
      }) => ({
        cart: { user: { clerkUserId: authentication.clerkUserId } },
      }),
    }),
    product: sdk.makeSelection({
      model: productReplicaV1,
      where: ({
        authentication,
      }: {
        authentication: { clerkUserId: IClerkUserId };
      }) => ({
        cartItems: {
          cart: { user: { clerkUserId: authentication.clerkUserId } },
        },
      }),
    }),
  },
});
