import { RoutePattern } from '@remix-run/route-pattern';
import * as sdk from '@zerospin/sdk';
import { Effect } from 'effect';

import {
  clerkCredentialsSchema,
  userAggregateClaims,
  userAggregateId,
} from '../../../claims';
import { verifyClerkIdentity } from '../../../verifyClerkIdentity';
import { purchaseV1 } from '../models/purchase/PurchaseV1';
import { purchaseItemV1 } from '../models/purchaseItem/PurchaseItemV1';

const db = sdk.makeActorDbVersion({
  models: { purchase: purchaseV1, purchaseItem: purchaseItemV1 },
});
export const userActorV1 = sdk.makeAggregateActorVersion(
  sdk.defineAggregateActor({ name: 'user' }),
  {
    version: '1.0.0',
    db,
    identity: sdk.makeActorIdentity({
      claims: userAggregateClaims,
      actorPath: RoutePattern.parse('/:clerkUserId'),
    }),
    authentication: {
      credentialsSchema: clerkCredentialsSchema,
      authenticate: ({ credentials }) =>
        verifyClerkIdentity(credentials).pipe(
          Effect.map(clerkUserId => ({
            clerkUserId,
            aggregateId: userAggregateId(clerkUserId),
          })),
        ),
    },
    authorize: ({ claims, aggregateId }) =>
      claims.aggregateId === userAggregateId(claims.clerkUserId) &&
      aggregateId === claims.aggregateId
        ? Effect.void
        : Effect.fail(
            sdk.makeZerospinError({
              code: 'user-aggregate-identity-mismatch',
              message:
                'The purchase aggregate must belong to the verified Clerk subject.',
            }),
          ),
    contracts: {},
    selections: {
      purchase: db.query.purchase.findMany({}),
      purchaseItem: db.query.purchaseItem.findMany({}),
    },
  },
);
