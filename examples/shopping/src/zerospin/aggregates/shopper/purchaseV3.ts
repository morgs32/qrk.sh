import {
  makePurchaseModule,
  makeRecordIntentObservation,
} from '@zerospin/purchase/server';
import * as sdk from '@zerospin/sdk';
import { Effect } from 'effect';

import {
  shopperSelectionSchema,
  type shopperIdentitySchema,
} from './actors/identities';
import { removeFromCartV3 } from './contracts/removeFromCart/RemoveFromCartV3';
import { purchase } from './purchase';
import { purchaseFrontendV3 } from './purchaseFrontendV3';
const nextObservation = makeRecordIntentObservation<
  typeof purchaseFrontendV3.contracts.confirmCheckout.models,
  typeof shopperIdentitySchema,
  typeof shopperSelectionSchema
>({
  frontend: purchaseFrontendV3,
  selectionIdentitySchema: shopperSelectionSchema,
  resolveUserId: ({ queryDb, identity }) =>
    queryDb.query.user
      .findFirst({ where: { clerkUserId: { eq: identity.clerkUserId } } })
      .sync()?.id,
});
const recordPaymentObservation = sdk.upgradeContractVersion(
  purchase.contracts.recordPaymentObservation,
  {
    version: '2.0.0',
    identity: shopperSelectionSchema,
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
  typeof shopperIdentitySchema,
  typeof shopperSelectionSchema,
  typeof removeFromCartV3
>({
  frontend: purchaseFrontendV3,
  recordPaymentObservation,
  selectionIdentitySchema: shopperSelectionSchema,
  resolveUserId: ({ queryDb, identity }) =>
    queryDb.query.user
      .findFirst({ where: { clerkUserId: { eq: identity.clerkUserId } } })
      .sync()?.id,
  cartContracts: { removeFromCart: removeFromCartV3 },
});
