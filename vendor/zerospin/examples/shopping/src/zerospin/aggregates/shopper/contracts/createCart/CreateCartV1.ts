import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { ZerospinError } from '@zerospin/error';
import { contracts, primitives } from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { cart } from '../../models/cart/cart';
import { cartV1 } from '../../models/cart/CartV1';
import { user } from '../../models/user/user';
import { type userV1 } from '../../models/user/UserV1';

import { createCart } from './createCart';

export const createCartV1 = contracts.makeVersion(createCart, {
  payload: {
    id: primitives.foreignKey({ abbreviation: cart.abbreviation }),
    userId: primitives.foreignKey({ abbreviation: user.abbreviation }),
  },

  guard: ({
    db,
    payload,
  }: {
    db: Readonly<
      Pick<
        IDb<IResourceDbConfig<{ user: typeof userV1 }, Record<never, never>>>,
        'query'
      >
    >;
    payload: { userId: ReturnType<typeof userV1.prefixId> };
  }) =>
    Effect.gen(function* () {
      const resource = yield* Effect.try({
        try: () =>
          db.query.user
            .findFirst({ where: { id: { eq: payload.userId } } })
            .sync(),
        catch: ZerospinError.catch({
          code: 'user-guard-query-failed',
          message: 'Failed to query user during guard evaluation',
        }),
      });
      if (resource === undefined) {
        return yield* new ZerospinError({
          code: 'user-not-found',
          message: `user ${payload.userId} was not found`,
        });
      }
    }),
  models: { cart: cartV1 },
  program: ({ payload, models }) => {
    const { id, userId } = payload;
    return Effect.all({
      created: models.cart.create({
        resourceId: id,
        attributes: { userId },
      }),
    });
  },
  version: '1.0.0',
});
