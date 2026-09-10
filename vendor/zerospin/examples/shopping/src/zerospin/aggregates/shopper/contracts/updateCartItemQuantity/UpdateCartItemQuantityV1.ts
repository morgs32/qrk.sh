import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { ZerospinError } from '@zerospin/error';
import { contracts, primitives } from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { cartItem } from '../../models/cartItem/cartItem';
import { cartItemV2 } from '../../models/cartItem/CartItemV2';

import { updateCartItemQuantity } from './updateCartItemQuantity';

export const updateCartItemQuantityV1 = contracts.makeVersion(
  updateCartItemQuantity,
  {
    payload: {
      cartItemId: primitives.foreignKey({
        abbreviation: cartItem.abbreviation,
      }),
      amount: primitives.integer(),
    },

    guard: ({
      db,
      payload,
    }: {
      db: Readonly<
        Pick<
          IDb<
            IResourceDbConfig<
              { cartItem: typeof cartItemV2 },
              Record<never, never>
            >
          >,
          'query'
        >
      >;
      payload: { cartItemId: ReturnType<typeof cartItemV2.prefixId> };
    }) =>
      Effect.gen(function* () {
        const resource = yield* Effect.try({
          try: () =>
            db.query.cartItem
              .findFirst({ where: { id: { eq: payload.cartItemId } } })
              .sync(),
          catch: ZerospinError.catch({
            code: 'cartItem-guard-query-failed',
            message: 'Failed to query cartItem during guard evaluation',
          }),
        });
        if (resource === undefined) {
          return yield* new ZerospinError({
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
