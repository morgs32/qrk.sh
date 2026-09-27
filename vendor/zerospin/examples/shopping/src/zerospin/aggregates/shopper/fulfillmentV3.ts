import { makeFulfillmentModule } from '@zerospin/fulfillment/server';

import {
  shopperSelectionSchema,
  type shopperIdentitySchema,
} from './actors/identities';
import { fulfillmentFrontend } from './fulfillmentFrontend';
import { purchaseV3 } from './purchaseV3';
import { resolvePurchaseOwner } from './resolvePurchaseOwner';
export const fulfillmentV3 = makeFulfillmentModule<
  typeof fulfillmentFrontend.contracts.requestPacking.models,
  typeof shopperIdentitySchema,
  typeof shopperSelectionSchema,
  typeof purchaseV3.contracts.recordPaymentObservation
>({
  frontend: fulfillmentFrontend,
  paid: purchaseV3.contracts.recordPaymentObservation,
  selectionIdentitySchema: shopperSelectionSchema,
  resolvePurchaseOwner,
});
