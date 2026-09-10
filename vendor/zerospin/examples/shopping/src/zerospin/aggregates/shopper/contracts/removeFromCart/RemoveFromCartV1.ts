import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { ZerospinError } from '@zerospin/error';
import { contracts, primitives } from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { cartItem } from '../../models/cartItem/cartItem';
import { cartItemV1 } from '../../models/cartItem/CartItemV1';

import { removeFromCart } from './removeFromCart';

export const removeFromCartV1 = contracts.makeVersion(removeFromCart, {
  payload: {
    id: primitives.foreignKey({ abbreviation: cartItem.abbreviation }),
  },

  guard: ({
    db,
    payload,
  }: {
    db: Readonly<
      Pick<
        IDb<
          IResourceDbConfig<
            { cartItem: typeof cartItemV1 },
            Record<never, never>
          >
        >,
        'query'
      >
    >;
    payload: { id: ReturnType<typeof cartItemV1.prefixId> };
  }) =>
    Effect.gen(function* () {
      const resource = yield* Effect.try({
        try: () =>
          db.query.cartItem
            .findFirst({ where: { id: { eq: payload.id } } })
            .sync(),
        catch: ZerospinError.catch({
          code: 'cartItem-guard-query-failed',
          message: 'Failed to query cartItem during guard evaluation',
        }),
      });
      if (resource === undefined) {
        return yield* new ZerospinError({
          code: 'cart-item-not-found',
          message: `cartItem ${payload.id} was not found`,
        });
      }
    }),
  models: { cartItem: cartItemV1 },
  program: ({ payload, models }) => {
    const { id } = payload;
    return Effect.all({
      deleted: models.cartItem.delete({
        resourceId: id,
      }),
    });
  },
  version: '1.0.0',
});
