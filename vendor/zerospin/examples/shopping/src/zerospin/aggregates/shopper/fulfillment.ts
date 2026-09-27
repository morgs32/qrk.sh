import { makeFulfillmentModule } from '@zerospin/fulfillment/server';

import { userClaims, type shopperClaims } from '../../claims';

import { fulfillmentFrontend } from './fulfillmentFrontend';
import { purchase } from './purchase';
import { resolvePurchaseOwner } from './resolvePurchaseOwner';
export const fulfillment = makeFulfillmentModule<
  typeof fulfillmentFrontend.contracts.requestPacking.models,
  typeof shopperClaims,
  typeof userClaims,
  typeof purchase.contracts.recordPaymentObservation
>({
  frontend: fulfillmentFrontend,
  paid: purchase.contracts.recordPaymentObservation,
  selectionIdentitySchema: userClaims,
  resolvePurchaseOwner,
});
