import { makeFulfillmentFrontendModule } from '@zerospin/fulfillment/browser';

import { shopperClaims } from '../../claims';
import { fulfillmentSource } from '../../services/fulfillment/fulfillmentSource';

import { cartV1 } from './models/cart/CartV1';
import { userV1 } from './models/user/UserV1';
import { purchaseFrontend } from './purchaseFrontend';
import { resolvePurchaseOwner } from './resolvePurchaseOwner';
export const fulfillmentFrontend = makeFulfillmentFrontendModule({
  models: {
    purchase: purchaseFrontend.models.purchase,
    cart: cartV1,
    user: userV1,
  },
  source: fulfillmentSource,
  claimsSchema: shopperClaims,
  resolvePurchaseOwner,
});
