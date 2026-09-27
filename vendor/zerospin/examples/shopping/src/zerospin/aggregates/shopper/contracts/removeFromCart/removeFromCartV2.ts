import { makeAbbreviationIdSchema } from '@zerospin/schema';
import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { shopperIdentitySchema } from '../../actors/identities';
import { cartItemV2 } from '../../models/cartItem/CartItemV2';
import { purchaseFrontend } from '../../purchaseFrontend';
import { canEditCart } from '../addToCart/AddToCartV1';

import { removeFromCartV1 } from './RemoveFromCartV1';
const { checkout: checkoutV1 } = purchaseFrontend.models;

export const removeFromCartV2 = sdk.upgradeContractVersion(removeFromCartV1, {
  identity: shopperIdentitySchema,
  version: '2.0.0',
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
  payload: {
    releaseCheckoutIds: sdk.primitives.json({
      schema: Schema.Array(makeAbbreviationIdSchema('chk')),
    }),
  },
  up: Effect.fn('removeFromCartV2.up')(function* ({ payload }) {
    return { ...payload, releaseCheckoutIds: [] };
  }),
  models: { cartItem: cartItemV2, checkout: checkoutV1 },
  guard: Effect.fn('removeFromCartV2.guard')(function* ({
    failures,
    payload,
    identity,
    queryDb,
  }) {
    const db = queryDb;
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
      cart: queryDb.query.cart
        .findFirst({ where: { id: { eq: item.cartId } } })
        .sync(),
      user: queryDb.query.user
        .findFirst({
          where: { clerkUserId: { eq: identity.clerkUserId } },
        })
        .sync(),
      hasPendingPurchase:
        queryDb.query.checkout
          .findFirst({
            where: {
              cartId: { eq: item.cartId },
              status: { in: ['accepted', 'paying', 'declined'] },
            },
          })
          .sync() !== undefined ||
        queryDb.query.purchase
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
