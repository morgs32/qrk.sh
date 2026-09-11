import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { cartItem } from '../../models/cartItem/cartItem';
import { cartItemV1 } from '../../models/cartItem/CartItemV1';

import { removeFromCart } from './removeFromCart';

export const removeFromCartV1 = sdk.makeContractVersion(removeFromCart, {
  payload: {
    id: sdk.primitives.foreignKey({ abbreviation: cartItem.abbreviation }),
  },

  guard: ({
    db,
    payload,
  }: {
    db: Readonly<
      Pick<
        sdk.IDb<
          sdk.IResourceDbConfig<
            { cartItem: typeof cartItemV1 },
            Record<never, never>
          >
        >,
        'query'
      >
    >;
    payload: { id: sdk.InferResource<typeof cartItemV1>['id'] };
  }) =>
    Effect.gen(function* () {
      const resource = yield* Effect.try({
        try: () =>
          db.query.cartItem
            .findFirst({ where: { id: { eq: payload.id } } })
            .sync(),
        catch: sdk.ZerospinError.catch({
          code: 'cartItem-guard-query-failed',
          message: 'Failed to query cartItem during guard evaluation',
        }),
      });
      if (resource === undefined) {
        return yield* new sdk.ZerospinError({
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
