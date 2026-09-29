import type { IClaimsSchema } from '@zerospin/core/identity/types';
import '@zerospin/server-only';

import { makeCreateAcceptedPurchase } from './createAcceptedPurchase.js';
import { makeFailCheckout } from './failCheckout.js';
import type { IPurchaseHostModels, IUserLookup } from './host.js';
import type { makePurchaseFrontendModule } from './makePurchaseFrontendModule.js';
import { makeRecordIntentObservation } from './recordIntentObservation.js';
import { makeRecordWorkflowPromotion } from './recordWorkflowPromotion.js';
type IFrontend<
  H extends IPurchaseHostModels,
  I extends IClaimsSchema,
> = ReturnType<typeof makePurchaseFrontendModule<H, I>>;
type ICreateAcceptedPurchase<
  H extends IPurchaseHostModels,
  I extends IClaimsSchema,
  S extends IClaimsSchema,
> = ReturnType<typeof makeCreateAcceptedPurchase<H, I, S>>;
type IRecordIntentObservation<
  H extends IPurchaseHostModels,
  I extends IClaimsSchema,
  S extends IClaimsSchema,
> = ReturnType<typeof makeRecordIntentObservation<H, I, S>>;
type IRecordWorkflowPromotion<
  H extends IPurchaseHostModels,
  I extends IClaimsSchema,
  S extends IClaimsSchema,
> = ReturnType<typeof makeRecordWorkflowPromotion<H, I, S>>;
type IFailCheckout<
  H extends IPurchaseHostModels,
  I extends IClaimsSchema,
  S extends IClaimsSchema,
> = ReturnType<typeof makeFailCheckout<H, I, S>>;
type IPurchaseModule<
  H extends IPurchaseHostModels,
  I extends IClaimsSchema,
  S extends IClaimsSchema,
> = {
  models: IFrontend<H, I>['models'];
  contracts: IFrontend<H, I>['contracts'] & {
    createAcceptedPurchase: ICreateAcceptedPurchase<H, I, S>;
    recordPaymentObservation: IRecordIntentObservation<H, I, S>;
    recordPromotion: IRecordWorkflowPromotion<H, I, S>;
    failCheckout: IFailCheckout<H, I, S>;
  };
};
const makePurchaseModuleImpl = <
  const HOST extends IPurchaseHostModels,
  const CLAIMS extends IClaimsSchema,
  const SELECTION extends IClaimsSchema,
>(options: {
  frontend: ReturnType<typeof makePurchaseFrontendModule<HOST, CLAIMS>>;
  recordPaymentObservation?: IRecordIntentObservation<HOST, CLAIMS, SELECTION>;
  selectionIdentitySchema: SELECTION;
  resolveUserId: IUserLookup<HOST, SELECTION>;
}): IPurchaseModule<HOST, CLAIMS, SELECTION> => {
  const { frontend } = options;

  const {
    confirmCheckout,
    initiatePayment,
    cancelPurchase,
    applyPromotion,
    removePromotion,
  } = frontend.contracts;

  const createAcceptedPurchase = makeCreateAcceptedPurchase(options);
  const recordIntentObservation =
    options.recordPaymentObservation ?? makeRecordIntentObservation(options);
  const recordWorkflowPromotion = makeRecordWorkflowPromotion(options);
  const failCheckout = makeFailCheckout(options);
  return {
    models: frontend.models,
    contracts: {
      confirmCheckout,
      initiatePayment,
      cancelPurchase,
      applyPromotion,
      removePromotion,
      createAcceptedPurchase,
      recordPaymentObservation: recordIntentObservation,
      recordPromotion: recordWorkflowPromotion,
      failCheckout,
    },
  };
};

export function makePurchaseModule<
  const HOST extends IPurchaseHostModels,
  const CLAIMS extends IClaimsSchema,
  const SELECTION extends IClaimsSchema,
>(
  options: Parameters<
    typeof makePurchaseModuleImpl<HOST, CLAIMS, SELECTION>
  >[0],
): ReturnType<typeof makePurchaseModuleImpl<HOST, CLAIMS, SELECTION>> {
  return makePurchaseModuleImpl(options);
}
