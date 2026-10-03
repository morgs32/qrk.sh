import * as sdk from '@zerospin/sdk';

import { purchaseItemPreviewV1 } from './actors/purchaseItemPreviewV1';
import { userActorV1 } from './actors/userActorV1';
import { purchaseV1 } from './models/purchase/PurchaseV1';
import { purchaseItemV1 } from './models/purchaseItem/PurchaseItemV1';
export const userAggregateV1 = sdk.makeAggregateVersion(
  sdk.defineAggregate({ name: 'user' }),
  {
    version: '1.0.0',
    models: { purchase: purchaseV1, purchaseItem: purchaseItemV1 },
    contracts: {},
    actors: { user: userActorV1, purchaseItemPreview: purchaseItemPreviewV1 },
  },
);
