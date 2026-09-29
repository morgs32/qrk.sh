import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { userClaims } from '../../../../claims';
import { cartItemV3 } from '../../models/cartItem/CartItemV3';
import { canEditCart } from '../addToCart/AddToCartV1';

import { removeFromCartV2 } from './removeFromCartV2';
export const removeFromCartV3 = sdk.upgradeContractVersion(removeFromCartV2, {
  claims: userClaims,
  version: '3.0.0',
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
    cartItemNotFound: sdk.ContractError.schema({
      code: 'cart-item-not-found',
    }),
  },
  payload: {},
  up: Effect.fn(function* ({ payload }) {
    return payload;
  }),
  down: Effect.fn(function* ({ payload }) {
    return payload;
  }),
  models: { cartItem: cartItemV3 },
  guard: Effect.fn('removeFromCartV3.guard')(function* ({
    failures,
    payload,
    claims,
    db,
  }) {
    const item = db.query.cartItem
      .findFirst({ where: { id: { eq: payload.id } } })
      .sync();
    if (!item || item.cartId === null) {
      return yield* Effect.fail(
        failures.cartItemNotFound.make({ message: 'Cart item not found.' }),
      );
    }
    yield* canEditCart({
      failures,
      cartId: item.cartId,
      cart: db.query.cart
        .findFirst({ where: { id: { eq: item.cartId } } })
        .sync(),
      user: db.query.user
        .findFirst({
          where: { clerkUserId: { eq: claims.clerkUserId } },
        })
        .sync(),
      hasPendingPurchase:
        db.query.checkout
          .findFirst({
            where: {
              cartId: { eq: item.cartId },
              status: { in: ['accepted', 'paying', 'declined'] },
            },
          })
          .sync() !== undefined ||
        db.query.purchase
          .findFirst({
            where: {
              cartId: { eq: item.cartId },
              status: { in: ['unpaid'] },
            },
          })
          .sync() !== undefined,
    });
    const items = db.query.cartItem
      .findMany({ where: { cartId: { eq: item.cartId } } })
      .sync();
    const promotions =
      items.length === 1
        ? db.query.checkout
            .findMany({ where: { cartId: { eq: item.cartId } } })
            .sync()
            .filter(
              row =>
                row.promotionReservationId !== null &&
                (row.status === 'promotion' || row.status === 'failed'),
            )
        : [];
    if (
      JSON.stringify(promotions.map(row => row.id).sort()) !==
      JSON.stringify([...payload.releaseCheckoutIds].sort())
    ) {
      return yield* failures.cartUnavailable.make({
        extra: { cartId: item.cartId },
        message: 'Cart promotions changed. Review and retry.',
      });
    }
  }),
  program: ({ payload, models }) =>
    Effect.gen(function* () {
      return [
        yield* models.cartItem.delete({ resourceId: payload.id }),
        ...(yield* Effect.forEach(payload.releaseCheckoutIds, id =>
          models.checkout.update({
            resourceId: id,
            attributes: { status: 'removing' },
          }),
        )),
      ];
    }),
});
