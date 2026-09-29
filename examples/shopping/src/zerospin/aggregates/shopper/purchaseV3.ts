import {
  makePurchaseModule,
  makeRecordIntentObservation,
} from '@zerospin/purchase/server';
import * as sdk from '@zerospin/sdk';
import { Effect } from 'effect';

import { userClaims, type shopperClaims } from '../../claims';

import { purchase } from './purchase';
import { purchaseFrontendV3 } from './purchaseFrontendV3';
const nextObservation = makeRecordIntentObservation<
  typeof purchaseFrontendV3.contracts.confirmCheckout.models,
  typeof shopperClaims,
  typeof userClaims
>({
  frontend: purchaseFrontendV3,
  selectionIdentitySchema: userClaims,
  resolveUserId: ({ db, claims }) =>
    db.query.user
      .findFirst({ where: { clerkUserId: { eq: claims.clerkUserId } } })
      .sync()?.id,
});
const recordPaymentObservation = sdk.upgradeContractVersion(
  purchase.contracts.recordPaymentObservation,
  {
    version: '2.0.0',
    claims: userClaims,
    failures: nextObservation.failures,
    models: nextObservation.models,
    payload: {},
    up: ({ payload }) => Effect.succeed(payload),
    down: ({ payload }) => Effect.succeed(payload),
    guard: nextObservation.guard!,
    program: nextObservation.program,
  },
);
export const purchaseV3 = makePurchaseModule<
  typeof purchaseFrontendV3.contracts.confirmCheckout.models,
  typeof shopperClaims,
  typeof userClaims
>({
  frontend: purchaseFrontendV3,
  recordPaymentObservation,
  selectionIdentitySchema: userClaims,
  resolveUserId: ({ db, claims }) =>
    db.query.user
      .findFirst({ where: { clerkUserId: { eq: claims.clerkUserId } } })
      .sync()?.id,
});
