import { RoutePattern } from '@remix-run/route-pattern';
import * as sdk from '@zerospin/sdk';
import { Effect } from 'effect';

import { clerkCredentialsSchema, userClaims } from '../../../claims';
import { verifyClerkIdentity } from '../../../verifyClerkIdentity';
import { productV1 } from '../models/product/ProductV1';

const db = sdk.makeActorDbVersion({ models: { product: productV1 } });
export const catalogActorV1 = sdk.makeServiceActorVersion(
  sdk.defineServiceActor({ name: 'catalog' }),
  {
    version: '1.0.0',
    db,
    identity: sdk.makeActorIdentity({
      claims: userClaims,
      actorPath: RoutePattern.parse('/:clerkUserId'),
    }),
    authentication: {
      credentialsSchema: clerkCredentialsSchema,
      authenticate: ({ credentials }) =>
        verifyClerkIdentity(credentials).pipe(
          Effect.map(clerkUserId => ({ clerkUserId })),
        ),
    },
    contracts: {},
    selections: { product: db.query.product.findMany({}) },
  },
);
