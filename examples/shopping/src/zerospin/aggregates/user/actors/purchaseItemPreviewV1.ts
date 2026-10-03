import { RoutePattern } from '@remix-run/route-pattern';
import * as sdk from '@zerospin/sdk';
import { Schema } from 'effect';

import { purchaseV1 } from '../models/purchase/PurchaseV1';
import { purchaseItemV1 } from '../models/purchaseItem/PurchaseItemV1';
const db = sdk.makeActorDbVersion({
  models: { purchase: purchaseV1, purchaseItem: purchaseItemV1 },
});
export const purchaseItemPreviewV1 = sdk.makeAggregateActorVersion(
  sdk.defineAggregateActor({ name: 'purchaseItemPreview' }),
  {
    version: '1.0.0',
    authentication: 'system',
    db,
    identity: sdk.makeActorIdentity({
      claims: Schema.Struct({
        aggregateId: Schema.String.check(Schema.isPattern(/^acct_.+/)),
      }),
      actorPath: RoutePattern.parse('/'),
    }),
    contracts: {},
    selections: {
      purchase: db.query.purchase.findMany({}),
      purchaseItem: db.query.purchaseItem.findMany({}),
    },
  },
);
