import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { shopperIdentitySchema } from '../../actors/identities';
import { user } from '../../models/user/user';
import { userV1 } from '../../models/user/UserV1';

import { createUser } from './createUser';
export const createUserV1 = sdk.makeContractVersion(createUser, {
  failures: {
    actorDenied: sdk.ActorError.schema({
      code: 'actor-denied',
      extra: Schema.Struct({ operation: Schema.String }),
    }),
    userClerkIdentityAlreadyExists: sdk.ContractError.schema({
      code: 'user-clerk-identity-already-exists',
    }),
  },
  identity: shopperIdentitySchema,
  payload: {
    id: sdk.primitives.foreignKey({ abbreviation: user.abbreviation }),
  },

  models: { user: userV1 },
  guard: Effect.fn('createUserV1.guard')(function* ({
    failures,
    identity,
    queryDb,
  }) {
    const db = queryDb;
    const resource = yield* Effect.try({
      try: () =>
        db.query.user
          .findFirst({
            where: { clerkUserId: { eq: identity.clerkUserId } },
          })
          .sync(),
      catch: sdk.catchZerospinError({
        code: 'user-guard-query-failed',
        message: 'Failed to query user during guard evaluation',
      }),
    });
    if (resource !== undefined) {
      return yield* Effect.fail(
        failures.userClerkIdentityAlreadyExists.make({
          message: 'A User already exists for this Clerk identity',
        }),
      );
    }
  }),
  program: ({ payload, identity, models }) =>
    Effect.gen(function* () {
      const { id } = payload;
      const { clerkUserId } = identity;
      return yield* Effect.all([
        models.user.create({
          resourceId: id,
          attributes: {
            clerkUserId,
            name: null,
          },
        }),
      ]);
    }),
  version: '1.0.0',
});
