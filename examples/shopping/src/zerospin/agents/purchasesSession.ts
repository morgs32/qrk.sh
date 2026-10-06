import { makeAgentContract, makeAgentSession } from '@zerospin/browser';
import { makeActorDbVersion } from '@zerospin/sdk/browser';

import { createTrackingLabelV1 } from '../aggregates/user/contracts/createTrackingLabelV1';
import { updateTrackingInfoV1 } from '../aggregates/user/contracts/updateTrackingInfoV1';
import { purchaseV1 } from '../aggregates/user/models/purchase/PurchaseV1';
import { purchaseItemV1 } from '../aggregates/user/models/purchaseItem/PurchaseItemV1';
import { adminClaims } from '../claims';

const db = makeActorDbVersion({
  models: { purchase: purchaseV1, purchaseItem: purchaseItemV1 },
});

export const purchasesSession = makeAgentSession({
  systemName: 'shopping',
  sessionName: 'purchases',
  aggregateName: 'user',
  aggregateVersion: '1.0.0',
  actorName: 'admin',
  actorVersion: '1.0.0',
  claimsSchema: adminClaims,
  db,
  selections: {
    purchase: db.query.purchase.findMany({
      where: { paymentState: { eq: 'paid' } },
    }),
    purchaseItem: db.query.purchaseItem.findMany({}),
  },
  contracts: {
    createTrackingLabel: makeAgentContract({
      contractVersion: createTrackingLabelV1,
      model: purchaseV1,
      bind: { purchaseId: 'id' },
    }),
    updateTrackingInfo: makeAgentContract({
      contractVersion: updateTrackingInfoV1,
      model: purchaseV1,
      bind: { purchaseId: 'id' },
    }),
  },
});
