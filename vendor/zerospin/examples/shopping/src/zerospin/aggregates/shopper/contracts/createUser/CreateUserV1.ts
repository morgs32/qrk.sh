import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { ZerospinError } from '@zerospin/error';
import { contracts, primitives } from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { user } from '../../models/user/user';
import { userV1 } from '../../models/user/UserV1';

import { createUser } from './createUser';

export const createUserV1 = contracts.makeVersion(createUser, {
  payload: {
    id: primitives.foreignKey({ abbreviation: user.abbreviation }),
    clerkUserId: primitives.text(),
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
      if (resource !== undefined) {
        return yield* new ZerospinError({
          code: 'user-already-exists',
          message: `user ${payload.id} already exists`,
        });
      }
    }),
  models: { user: userV1 },
  program: ({ payload, models }) => {
    const { id, clerkUserId } = payload;
    return Effect.all({
      created: models.user.create({
        resourceId: id,
        attributes: {
          clerkUserId,
          name: null,
        },
      }),
    });
  },
  version: '1.0.0',
});
