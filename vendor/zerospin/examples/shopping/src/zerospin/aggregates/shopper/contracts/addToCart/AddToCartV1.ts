import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { userClaims } from '../../../../claims';
import { productV1 } from '../../../../services/app/models/product/ProductV1';
import { cart } from '../../models/cart/cart';
import { cartV1 } from '../../models/cart/CartV1';
import { cartItem } from '../../models/cartItem/cartItem';
import { cartItemV1 } from '../../models/cartItem/CartItemV1';
import { productReplicaV1 } from '../../models/productReplica/ProductReplicaV1';
import { userV1 } from '../../models/user/UserV1';
import { purchaseFrontend } from '../../purchaseFrontend';

import { addToCart } from './addToCart';
const { checkout: checkoutV1, purchase: purchaseV1 } = purchaseFrontend.models;

/** Reusable domain check; each owner supplies rows from its own query capability. */
export const canEditCart = Effect.fn('canEditCart')(function* (props: {
  failures: {
    cartUnavailable: ReturnType<
      typeof sdk.ContractError.schema<
        'cart-unavailable',
        Schema.Struct<{ cartId: typeof Schema.String }>
      >
    >;
    cartFrozen: ReturnType<
      typeof sdk.ContractError.schema<
        'cart-frozen',
        Schema.Struct<{ cartId: typeof Schema.String }>
      >
    >;
  };
  cartId: string;
  cart: Readonly<{ userId: string | null }> | undefined;
  user: Readonly<{ id: string }> | undefined;
  hasPendingPurchase: boolean;
}) {
  if (props.cart === undefined || props.cart.userId !== props.user?.id) {
    return yield* props.failures.cartUnavailable.make({
      extra: { cartId: props.cartId },
      message: 'Cart not found or owned by another shopper.',
    });
  }
  if (props.hasPendingPurchase) {
    return yield* props.failures.cartFrozen.make({
      extra: { cartId: props.cartId },
      message: 'Your cart is frozen until its purchase is paid or canceled.',
    });
  }
});

export const addToCartV1 = sdk.makeContractVersion(addToCart, {
  failures: {
    cartFrozen: sdk.ContractError.schema({
      code: 'cart-frozen',
      extra: Schema.Struct({ cartId: Schema.String }),
    }),
    cartUnavailable: sdk.ContractError.schema({
      code: 'cart-unavailable',
      extra: Schema.Struct({ cartId: Schema.String }),
    }),
    actorDenied: sdk.ActorError.schema({
      code: 'actor-denied',
      extra: Schema.Struct({ operation: Schema.String }),
    }),
  },
  claims: userClaims,
  guard: Effect.fn('addToCartV1.guard')(function* ({
    failures,
    payload,
    claims,
    queryDb,
  }) {
    return yield* canEditCart({
      failures,
      cartId: payload.cartId,
      cart: queryDb.query.cart
        .findFirst({ where: { id: { eq: payload.cartId } } })
        .sync(),
      user: queryDb.query.user
        .findFirst({
          where: { clerkUserId: { eq: claims.clerkUserId } },
        })
        .sync(),
      hasPendingPurchase:
        queryDb.query.checkout
          .findFirst({
            where: {
              cartId: { eq: payload.cartId },
              status: { in: ['accepted', 'paying', 'declined'] },
            },
          })
          .sync() !== undefined ||
        queryDb.query.purchase
          .findFirst({
            where: {
              cartId: { eq: payload.cartId },
              status: { in: ['unpaid'] },
            },
          })
          .sync() !== undefined,
    });
  }),
  payload: {
    cartId: sdk.primitives.foreignKey({ abbreviation: cart.abbreviation }),
    cartItemId: sdk.primitives.foreignKey({
      abbreviation: cartItem.abbreviation,
    }),
    product: sdk.primitives.json({ schema: productV1.resourceSchema }),
  },
  models: {
    cart: cartV1,
    user: userV1,
    purchase: purchaseV1,
    checkout: checkoutV1,
    productReplica: productReplicaV1,
    cartItem: cartItemV1,
  },
  program: ({ payload, models }) =>
    Effect.gen(function* () {
      const { cartItemId, cartId, product } = payload;
      return yield* Effect.all([
        models.productReplica.replicate(product),
        models.cartItem.create({
          resourceId: cartItemId,
          attributes: {
            cartId,
            productId: product.id,
          },
        }),
      ]);
    }),
  version: '1.0.0',
});
