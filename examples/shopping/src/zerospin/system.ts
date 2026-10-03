import * as sdk from '@zerospin/sdk';

import { purchaseItemPreviewV1 } from './aggregates/user/actors/purchaseItemPreviewV1';
import { userAggregateV1 } from './aggregates/user/userAggregateV1';
import { PromotionDevelopmentLive } from './PromotionDevelopmentLive';
import { marketplaceServiceV1 } from './services/marketplace/marketplaceServiceV1';
import { promotionService } from './services/promotion/promotionService';
export const system = sdk.makeSystem({
  name: 'shopping',
  agents: {
    purchaseItems: sdk.makeAgent({
      aggregate: userAggregateV1,
      actor: purchaseItemPreviewV1,
      query: { modelName: 'purchaseItem', where: { quantity: { gt: 0 } } },
    }),
  },
  layer: PromotionDevelopmentLive,
  aggregates: { user: { '1.0.0': userAggregateV1 } },
  services: {
    marketplace: { '1.0.0': marketplaceServiceV1 },
    promotion: { '1.0.0': promotionService },
  },
});
