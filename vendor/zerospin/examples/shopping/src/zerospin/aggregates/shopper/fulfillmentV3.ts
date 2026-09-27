import { makeFulfillmentModule } from '@zerospin/fulfillment/server';

import { userClaims, type shopperClaims } from '../../claims';

import { fulfillmentFrontend } from './fulfillmentFrontend';
import { purchaseV3 } from './purchaseV3';
import { resolvePurchaseOwner } from './resolvePurchaseOwner';
export const fulfillmentV3 = makeFulfillmentModule<
  typeof fulfillmentFrontend.contracts.requestPacking.models,
  typeof shopperClaims,
  typeof userClaims,
  typeof purchaseV3.contracts.recordPaymentObservation
>({
  frontend: fulfillmentFrontend,
  paid: purchaseV3.contracts.recordPaymentObservation,
  selectionIdentitySchema: userClaims,
  resolvePurchaseOwner,
});
