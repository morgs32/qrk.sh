import { makeFulfillmentModule } from '@zerospin/fulfillment/server';

import {
  shopperSelectionSchema,
  type shopperIdentitySchema,
} from './actors/identities';
import { fulfillmentFrontend } from './fulfillmentFrontend';
import { purchase } from './purchase';
import { resolvePurchaseOwner } from './resolvePurchaseOwner';
export const fulfillment = makeFulfillmentModule<
  typeof fulfillmentFrontend.contracts.requestPacking.models,
  typeof shopperIdentitySchema,
  typeof shopperSelectionSchema,
  typeof purchase.contracts.recordPaymentObservation
>({
  frontend: fulfillmentFrontend,
  paid: purchase.contracts.recordPaymentObservation,
  selectionIdentitySchema: shopperSelectionSchema,
  resolvePurchaseOwner,
});
