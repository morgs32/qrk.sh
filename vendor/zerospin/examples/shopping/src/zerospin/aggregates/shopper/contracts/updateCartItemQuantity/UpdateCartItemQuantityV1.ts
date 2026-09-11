import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { cartItem } from '../../models/cartItem/cartItem';
import { cartItemV2 } from '../../models/cartItem/CartItemV2';

import { updateCartItemQuantity } from './updateCartItemQuantity';

export const updateCartItemQuantityV1 = sdk.makeContractVersion(
  updateCartItemQuantity,
  {
    payload: {
      cartItemId: sdk.primitives.foreignKey({
        abbreviation: cartItem.abbreviation,
      }),
      amount: sdk.primitives.integer(),
    },

    guard: ({
      db,
      payload,
    }: {
      db: Readonly<
        Pick<
          sdk.IDb<
            sdk.IResourceDbConfig<
              { cartItem: typeof cartItemV2 },
              Record<never, never>
            >
          >,
          'query'
        >
      >;
      payload: { cartItemId: sdk.InferResource<typeof cartItemV2>['id'] };
    }) =>
      Effect.gen(function* () {
        const resource = yield* Effect.try({
          try: () =>
            db.query.cartItem
              .findFirst({ where: { id: { eq: payload.cartItemId } } })
              .sync(),
          catch: sdk.ZerospinError.catch({
            code: 'cartItem-guard-query-failed',
            message: 'Failed to query cartItem during guard evaluation',
          }),
        });
        if (resource === undefined) {
          return yield* new sdk.ZerospinError({
            code: 'cart-item-not-found',
            message: `cartItem ${payload.cartItemId} was not found`,
          });
        }
      }),
    models: { cartItem: cartItemV2 },
    program: ({ payload, models }) => {
      const { amount, cartItemId } = payload;
      return Effect.all({
        updated: models.cartItem.update({
          resourceId: cartItemId,
          attributes: { amount },
        }),
      });
    },
    version: '2.0.0',
  },
);
