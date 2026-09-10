import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { ZerospinError } from '@zerospin/error';
import { contracts, primitives } from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { user } from '../../models/user/user';
import { userV1 } from '../../models/user/UserV1';

import { updateUser } from './updateUser';

export const updateUserV1 = contracts.makeVersion(updateUser, {
  payload: {
    id: primitives.foreignKey({ abbreviation: user.abbreviation }),
    name: primitives.text(),
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
    payload: { id: ReturnType<typeof userV1.prefixId> };
  }) =>
    Effect.gen(function* () {
      const resource = yield* Effect.try({
        try: () =>
          db.query.user.findFirst({ where: { id: { eq: payload.id } } }).sync(),
        catch: ZerospinError.catch({
          code: 'user-guard-query-failed',
          message: 'Failed to query user during guard evaluation',
        }),
      });
      if (resource === undefined) {
        return yield* new ZerospinError({
          code: 'user-not-found',
          message: `user ${payload.id} was not found`,
        });
      }
    }),
  models: { user: userV1 },
  program: ({ payload, models }) => {
    const { id, name } = payload;
    return Effect.all({
      updated: models.user.update({
        resourceId: id,
        attributes: { name },
      }),
    });
  },
  version: '1.0.0',
});
