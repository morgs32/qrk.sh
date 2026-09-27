import { RoutePattern } from '@remix-run/route-pattern';
import * as sdk from '@zerospin/sdk';
import { Effect } from 'effect';

import {
  clerkCredentialsSchema,
  shopperIdentitySchema,
} from '../../../identities';
import { verifyClerkIdentity } from '../../../verifyClerkIdentity';
import { createUserV1 } from '../contracts/createUser/CreateUserV1';
import { userV1 } from '../models/user/UserV1';
const provisioner = sdk.defineAggregateActor({ name: 'provisioner' });
const db = sdk.makeActorDbVersion({ models: { user: userV1 } });
const identity = sdk.makeActorIdentity({
  schema: shopperIdentitySchema,
  actorPath: RoutePattern.parse('/:clerkUserId'),
});
export const provisionerV1 = sdk.makeAggregateActorVersion(provisioner, {
  authentication: {
    credentialsSchema: clerkCredentialsSchema,
    authenticate: ({ credentials }) =>
      verifyClerkIdentity(credentials).pipe(
        Effect.map(clerkUserId => ({
          aggregateId: 'acct_1' as const,
          clerkUserId,
        })),
      ),
  },
  version: '1.0.0',
  db,
  identity,
  contracts: { createUser: createUserV1 },
  queries: {
    user: db.query.user.findMany({
      where: {
        clerkUserId: { eq: identity.sql.placeholder('clerkUserId') },
      },
    }),
  },
});
