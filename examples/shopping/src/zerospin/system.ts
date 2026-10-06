import * as sdk from '@zerospin/sdk';
import { Layer } from 'effect';

import { agents } from '../../agents';

import { userAggregateV1 } from './aggregates/user/userAggregateV1';
import { PromotionDevelopmentLive } from './PromotionDevelopmentLive';
import { marketplaceServiceV1 } from './services/marketplace/marketplaceServiceV1';
import { promotionService } from './services/promotion/promotionService';
import { ShoppingProvidersLive } from './ShoppingProvidersLive';
import { ShoppingPurchaseDeliveryLive } from './ShoppingPurchaseDeliveryLive';
export const system = sdk.makeSystem({
  name: 'shopping',
  agents,
  layer: Layer.mergeAll(
    PromotionDevelopmentLive,
    ShoppingProvidersLive,
    ShoppingPurchaseDeliveryLive,
  ),
  aggregates: { user: { '1.0.0': userAggregateV1 } },
  services: {
    marketplace: { '1.0.0': marketplaceServiceV1 },
    promotion: { '1.0.0': promotionService },
  },
});
