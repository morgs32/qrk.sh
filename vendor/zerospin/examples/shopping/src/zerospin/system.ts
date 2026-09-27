import * as sdk from '@zerospin/sdk';
import { Layer } from 'effect';

import { shopperAggregateV2 } from './aggregates/shopper/shopperAggregateV2';
import { FulfillmentClientLive } from './FulfillmentClientLive';
import { PaymentProviderLive } from './PaymentProviderLive';
import { PromotionDevelopmentLive } from './PromotionDevelopmentLive';
import { PromotionProviderLive } from './PromotionProviderLive';
import { appServiceV1 } from './services/app/appServiceV1';
import { fulfillmentService } from './services/fulfillment/fulfillmentService';
import { promotionService } from './services/promotion/promotionService';
export const system = sdk.makeSystem({
  name: 'shopping',
  layer: Layer.mergeAll(
    PromotionDevelopmentLive,
    PaymentProviderLive,
    PromotionProviderLive.pipe(Layer.provide(PromotionDevelopmentLive)),
    FulfillmentClientLive,
  ),
  aggregates: {
    shopper: {
      '2.0.0': shopperAggregateV2,
    },
  },
  services: {
    fulfillment: fulfillmentService,
    app: appServiceV1,
    promotion: promotionService,
  },
});
