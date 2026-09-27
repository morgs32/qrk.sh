import { RoutePattern } from '@remix-run/route-pattern';
import { resolveFailure } from '@zerospin/core/contracts/failureCodec';
import * as sdk from '@zerospin/sdk';
import { Effect } from 'effect';

import { clerkCredentialsSchema, shopperClaims } from '../../../claims';
import { verifyClerkIdentity } from '../../../verifyClerkIdentity';
import { addToCartV1 } from '../contracts/addToCart/AddToCartV1';
import { createCartV1 } from '../contracts/createCart/CreateCartV1';
import { createUserV1 } from '../contracts/createUser/CreateUserV1';
import { removeFromCartV1 } from '../contracts/removeFromCart/RemoveFromCartV1';
import { updateUserV1 } from '../contracts/updateUser/UpdateUserV1';
import { cartV1 } from '../models/cart/CartV1';
import { cartItemV1 } from '../models/cartItem/CartItemV1';
import { productReplicaV1 } from '../models/productReplica/ProductReplicaV1';
import { userV1 } from '../models/user/UserV1';
import { purchaseFrontend } from '../purchaseFrontend';

import { provisionerV1 } from './provisionerV1';
const {
  checkout: checkoutV1,
  purchaseItem: purchaseItemV1,
  purchase: purchaseV1,
} = purchaseFrontend.models;

export const shopperActor = sdk.defineAggregateActor({ name: 'shopper' });
const shopperDb = sdk.makeActorDbVersion({
  models: {
    checkout: checkoutV1,
    user: userV1,
    cart: cartV1,
    cartItem: cartItemV1,
    product: productReplicaV1,
    purchase: purchaseV1,
    purchaseItem: purchaseItemV1,
  },
});
const shopperIdentity = sdk.makeActorIdentity({
  claims: shopperClaims,
  actorPath: RoutePattern.parse('/:clerkUserId'),
});
export const shopperActorV1 = sdk.makeAggregateActorVersion(shopperActor, {
  authentication: {
    credentialsSchema: clerkCredentialsSchema,
    authenticate: ({ credentials, executeCommand }) =>
      Effect.gen(function* () {
        const clerkUserId = yield* verifyClerkIdentity(credentials);
        const result = yield* executeCommand({
          aggregateId: 'acct_1',
          contract: createUserV1,
          actor: provisionerV1,
          claims: {
            aggregateId: 'acct_1',
            clerkUserId,
          },
          payload: {
            id: yield* sdk.makeId(userV1),
          },
        });
        if (result.admission.status === 'failed') {
          return yield* sdk.makeZerospinError({
            code: 'shopper-provisioning-failed',
            message: 'Cannot admit shopper provisioning',
            extra: { admission: result.admission },
          });
        }
        if (result.execution.status === 'failed') {
          const failure = yield* resolveFailure(
            createUserV1,
            result.execution.failure,
          );
          if (
            !('code' in failure) ||
            failure.code !== 'user-clerk-identity-already-exists'
          ) {
            return yield* Effect.fail(
              sdk.makeZerospinError({
                code: 'shopper-provisioning-failed',
                message: 'Cannot provision the admitted shopper',
                extra: { failure },
              }),
            );
          }
        }
        return {
          aggregateId: 'acct_1' as const,
          clerkUserId,
        };
      }),
  },
  version: '1.0.0',
  contracts: {
    addToCart: addToCartV1,
    createCart: createCartV1,
    removeFromCart: removeFromCartV1,
    updateUser: updateUserV1,
  },
  db: shopperDb,
  identity: shopperIdentity,
  queries: {
    checkout: shopperDb.query.checkout.findMany({
      where: {
        user: {
          clerkUserId: {
            eq: shopperIdentity.sql.placeholder('clerkUserId'),
          },
        },
      },
    }),
    user: shopperDb.query.user.findMany({
      where: {
        clerkUserId: {
          eq: shopperIdentity.sql.placeholder('clerkUserId'),
        },
      },
    }),
    cart: shopperDb.query.cart.findMany({
      where: {
        user: {
          clerkUserId: {
            eq: shopperIdentity.sql.placeholder('clerkUserId'),
          },
        },
      },
    }),
    cartItem: shopperDb.query.cartItem.findMany({
      where: {
        cart: {
          user: {
            clerkUserId: {
              eq: shopperIdentity.sql.placeholder('clerkUserId'),
            },
          },
        },
      },
    }),
    product: shopperDb.query.product.findMany({
      where: {
        cartItems: {
          cart: {
            user: {
              clerkUserId: {
                eq: shopperIdentity.sql.placeholder('clerkUserId'),
              },
            },
          },
        },
      },
    }),
    purchase: shopperDb.query.purchase.findMany({
      where: {
        cart: {
          user: {
            clerkUserId: {
              eq: shopperIdentity.sql.placeholder('clerkUserId'),
            },
          },
        },
      },
    }),
    purchaseItem: shopperDb.query.purchaseItem.findMany({
      where: {
        purchase: {
          cart: {
            user: {
              clerkUserId: {
                eq: shopperIdentity.sql.placeholder('clerkUserId'),
              },
            },
          },
        },
      },
    }),
  },
});
