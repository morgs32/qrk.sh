import { RoutePattern } from '@remix-run/route-pattern';
import * as sdk from '@zerospin/sdk';
import { Effect } from 'effect';

import { clerkCredentialsSchema, userClaims } from '../../../claims';
import { verifyClerkIdentity } from '../../../verifyClerkIdentity';
import { mappedAddToCartV1 } from '../contracts/addToCart/mappedAddToCartV1';
import {
  asyncCreatePurchaseV1,
  mappedCheckoutV1,
} from '../contracts/checkout/mappedCheckoutV1';
import { createCartV1 } from '../contracts/createCart/CreateCartV1';
import { removeFromCartV1 } from '../contracts/removeFromCart/RemoveFromCartV1';
import { updateCartItemQuantityV1 } from '../contracts/updateCartItemQuantity/UpdateCartItemQuantityV1';
import { cartV1 } from '../models/cart/CartV1';
import { cartItemV1 } from '../models/cartItem/CartItemV1';
import { productV1 } from '../models/product/ProductV1';

const db = sdk.makeActorDbVersion({
  models: { cart: cartV1, cartItem: cartItemV1, product: productV1 },
});
const identity = sdk.makeActorIdentity({
  claims: userClaims,
  actorPath: RoutePattern.parse('/:clerkUserId'),
});
export const shopperActorV1 = sdk.makeServiceActorVersion(
  sdk.defineServiceActor({ name: 'shopper' }),
  {
    version: '1.0.0',
    db,
    identity,
    authentication: {
      credentialsSchema: clerkCredentialsSchema,
      authenticate: ({ credentials }) =>
        verifyClerkIdentity(credentials).pipe(
          Effect.map(clerkUserId => ({ clerkUserId })),
        ),
    },
    contracts: {
      checkout: mappedCheckoutV1,
      asyncCreatePurchase: asyncCreatePurchaseV1,
      createCart: createCartV1,
      addToCart: mappedAddToCartV1,
      removeFromCart: removeFromCartV1,
      updateCartItemQuantity: updateCartItemQuantityV1,
    },
    guards: {
      createCart: ({ payload, claims, failures }) =>
        payload.userId === claims.clerkUserId
          ? Effect.void
          : Effect.fail(
              failures.actorDenied.make({
                message: 'Cannot create another shopper’s cart.',
              }),
            ),
      addToCart: ({ payload, claims, db, failures }) =>
        Effect.gen(function* () {
          const cart = db.query.cart
            .findFirst({ where: { id: { eq: payload.cartId } } })
            .sync();
          if (cart?.userId !== claims.clerkUserId) {
            yield* failures.actorDenied.make({
              message: 'Cannot edit another shopper’s cart.',
            });
          }
        }),
      removeFromCart: ({ payload, claims, db, failures }) =>
        Effect.gen(function* () {
          const item = db.query.cartItem
            .findFirst({
              where: { id: { eq: payload.id } },
              with: { cart: true },
            })
            .sync();
          if (item?.cart.userId !== claims.clerkUserId) {
            yield* failures.actorDenied.make({
              message: 'Cannot remove another shopper’s cart item.',
            });
          }
        }),
      updateCartItemQuantity: ({ payload, claims, db, failures }) =>
        Effect.gen(function* () {
          const item = db.query.cartItem
            .findFirst({
              where: { id: { eq: payload.cartItemId } },
              with: { cart: true },
            })
            .sync();
          if (item?.cart.userId !== claims.clerkUserId) {
            yield* failures.actorDenied.make({
              message: 'Cannot change another shopper’s quantity.',
            });
          }
        }),
    },
    selections: {
      cart: db.query.cart.findMany({
        where: { userId: { eq: identity.sql.placeholder('clerkUserId') } },
      }),
      cartItem: db.query.cartItem.findMany({
        where: {
          cart: { userId: { eq: identity.sql.placeholder('clerkUserId') } },
        },
      }),
      product: db.query.product.findMany({
        where: {
          cartItems: {
            cart: { userId: { eq: identity.sql.placeholder('clerkUserId') } },
          },
        },
      }),
    },
  },
);
