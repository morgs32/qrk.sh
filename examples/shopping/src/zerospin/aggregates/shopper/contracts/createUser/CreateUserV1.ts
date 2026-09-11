import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { user } from '../../models/user/user';
import { userV1 } from '../../models/user/UserV1';

import { createUser } from './createUser';

export const createUserV1 = sdk.makeContractVersion(createUser, {
  payload: {
    id: sdk.primitives.foreignKey({ abbreviation: user.abbreviation }),
    clerkUserId: sdk.primitives.text(),
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
    payload: {
      id: sdk.InferResource<typeof userV1>['id'];
      clerkUserId: string;
    };
  }) =>
    Effect.gen(function* () {
      const resource = yield* Effect.try({
        try: () =>
          db.query.user
            .findFirst({ where: { clerkUserId: { eq: payload.clerkUserId } } })
            .sync(),
        catch: sdk.ZerospinError.catch({
          code: 'user-guard-query-failed',
          message: 'Failed to query user during guard evaluation',
        }),
      });
      if (resource !== undefined) {
        return yield* new sdk.ZerospinError({
          code: 'user-clerk-identity-already-exists',
          message: 'A User already exists for this Clerk identity',
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
