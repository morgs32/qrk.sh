import { RoutePattern } from '@remix-run/route-pattern';
import * as sdk from '@zerospin/sdk';

import { adminClaims } from '../../../claims';
import { fulfillmentContracts } from '../contracts/fulfillmentContracts';
import { purchaseV1 } from '../models/purchase/PurchaseV1';
import { purchaseItemV1 } from '../models/purchaseItem/PurchaseItemV1';
const db = sdk.makeActorDbVersion({
  models: { purchase: purchaseV1, purchaseItem: purchaseItemV1 },
});
export const adminActorV1 = sdk.makeAggregateActorVersion(
  sdk.defineAggregateActor({ name: 'admin' }),
  {
    version: '1.0.0',
    authentication: 'system',
    db,
    identity: sdk.makeActorIdentity({
      claims: adminClaims,
      actorPath: RoutePattern.parse('/'),
    }),
    contracts: fulfillmentContracts,
    selections: {
      purchase: db.query.purchase.findMany({}),
      purchaseItem: db.query.purchaseItem.findMany({}),
    },
  },
);
