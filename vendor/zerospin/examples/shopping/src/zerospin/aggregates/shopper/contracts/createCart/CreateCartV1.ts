import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { cart } from '../../models/cart/cart';
import { cartV1 } from '../../models/cart/CartV1';
import { user } from '../../models/user/user';
import { type userV1 } from '../../models/user/UserV1';

import { createCart } from './createCart';

export const createCartV1 = sdk.makeContractVersion(createCart, {
  payload: {
    id: sdk.primitives.foreignKey({ abbreviation: cart.abbreviation }),
    userId: sdk.primitives.foreignKey({ abbreviation: user.abbreviation }),
  },

  guard: ({
    db,
    payload,
  }: {
    db: Readonly<
      Pick<
        sdk.IDb<
          sdk.IResourceDbConfig<{ user: typeof userV1 }, Record<never, never>>
        >,
        'query'
      >
    >;
    payload: { userId: sdk.InferResource<typeof userV1>['id'] };
  }) =>
    Effect.gen(function* () {
      const resource = yield* Effect.try({
        try: () =>
          db.query.user
            .findFirst({ where: { id: { eq: payload.userId } } })
            .sync(),
        catch: sdk.ZerospinError.catch({
          code: 'user-guard-query-failed',
          message: 'Failed to query user during guard evaluation',
        }),
      });
      if (resource === undefined) {
        return yield* new sdk.ZerospinError({
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
