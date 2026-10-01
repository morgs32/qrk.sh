import {
  makeFulfillmentOperationMachine,
  makePaidFulfillmentMachine,
} from '@zerospin/fulfillment/server';
import {
  makeAcceptPurchaseMachine,
  makePurchasePaymentMachine,
  makePurchasePromotionMachine,
} from '@zerospin/purchase/server';
import * as sdk from '@zerospin/sdk';
import { Layer, Schema } from 'effect';

import { shopperAggregateV2 } from './aggregates/shopper/shopperAggregateV2';
import { FulfillmentClientLive } from './FulfillmentClientLive';
import { PaymentProviderLive } from './PaymentProviderLive';
import { PromotionDevelopmentLive } from './PromotionDevelopmentLive';
import { PromotionProviderLive } from './PromotionProviderLive';
import { appServiceV1 } from './services/app/appServiceV1';
import { fulfillmentService } from './services/fulfillment/fulfillmentService';
import { promotionService } from './services/promotion/promotionService';
const userIdentity = Schema.Struct({
  id: Schema.String,
  clerkUserId: Schema.String,
});
const claimsForPurchaseUser = ({
  db,
  userId,
}: {
  db: Parameters<
    Parameters<typeof makeAcceptPurchaseMachine>[0]['claimsForUser']
  >[0]['db'];
  userId: string;
}) => {
  const users = Schema.decodeUnknownSync(Schema.Array(userIdentity))(
    db.query.user?.findMany().sync(),
  );
  const user = users.find(row => row.id === userId);
  if (user === undefined) throw new Error(`Purchase user ${userId} is missing`);
  return { clerkUserId: user.clerkUserId };
};
const acceptPurchase = makeAcceptPurchaseMachine({
  source: shopperAggregateV2,
  claimsForUser: claimsForPurchaseUser,
});
const processPayment = makePurchasePaymentMachine({
  source: shopperAggregateV2,
  claimsForUser: claimsForPurchaseUser,
});
const purchasePromotion = makePurchasePromotionMachine({
  source: shopperAggregateV2,
  claimsForUser: claimsForPurchaseUser,
});
const requestPaidFulfillment = makePaidFulfillmentMachine({
  source: shopperAggregateV2,
  serviceVersion: '1.0.0',
  claimsForUser: ({ db, userId }) => {
    const users = Schema.decodeUnknownSync(Schema.Array(userIdentity))(
      db.query.user?.findMany().sync(),
    );
    const user = users.find(row => row.id === userId);
    if (user === undefined) {
      throw new Error(`Fulfillment user ${userId} is missing`);
    }
    return { clerkUserId: user.clerkUserId };
  },
});
const operateFulfillment = makeFulfillmentOperationMachine({
  source: shopperAggregateV2,
  serviceVersion: '1.0.0',
  claimsForUser: ({ db, userId }) => {
    const users = Schema.decodeUnknownSync(Schema.Array(userIdentity))(
      db.query.user?.findMany().sync(),
    );
    const user = users.find(row => row.id === userId);
    if (user === undefined) {
      throw new Error(`Fulfillment user ${userId} is missing`);
    }
    return { clerkUserId: user.clerkUserId };
  },
});
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
  machines: {
    acceptPurchase,
    processPayment,
    purchasePromotion,
    requestPaidFulfillment,
    operateFulfillment,
  },
});
