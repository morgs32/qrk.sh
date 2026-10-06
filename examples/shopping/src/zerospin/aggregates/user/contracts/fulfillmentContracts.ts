/* oxlint-disable react-hooks/rules-of-hooks -- Effect Context service use is not a React hook. */
import * as sdk from '@zerospin/sdk';
import { Effect, Schema } from 'effect';

import { adminClaims } from '../../../claims';
import {
  LabelEvidence,
  PaymentEvidence,
  ShoppingProviders,
  TrackingEvidence,
} from '../../../ShoppingProviders';
import { purchaseV1 } from '../models/purchase/PurchaseV1';

import { CreatePurchaseResult, createPurchaseV1 } from './createPurchaseV1';
import {
  CreateTrackingLabelResult,
  createTrackingLabelV1,
} from './createTrackingLabelV1';
import {
  UpdateTrackingInfoResult,
  updateTrackingInfoV1,
} from './updateTrackingInfoV1';

const purchaseId = sdk.primitives.foreignKey({ abbreviation: 'pur' });
const key = sdk.primitives.text();
const staleObservation = sdk.ContractError.schema({
  code: 'stale-provider-observation',
});
export const asyncProcessPaymentV1 = sdk.makeExternalContract({
  name: 'asyncProcessPayment',
  version: '1.0.0',
  claims: adminClaims,
  payload: { purchaseId, key, total: sdk.primitives.integer() },
  models: { purchase: purchaseV1 },
  failures: { staleObservation },
  result: Schema.Null,
  external: {
    response: PaymentEvidence,
    request: ({ payload }) =>
      ShoppingProviders.use(provider => provider.pay(payload)),
  },
  program: ({ payload, response, db, models, failures }) =>
    Effect.gen(function* () {
      const purchase = db.query.purchase
        .findFirst({ where: { id: { eq: payload.purchaseId } } })
        .sync();
      if (
        !purchase ||
        purchase.paymentState !== 'pending' ||
        purchase.total !== payload.total ||
        response.key !== payload.key
      ) {
        return yield* failures.staleObservation.make({
          message: 'Payment evidence no longer matches its pending purchase.',
        });
      }
      yield* models.purchase.update({
        resourceId: purchase.id,
        attributes: {
          paymentState: response.state,
          paymentReference: response.reference,
          paymentEvidence: response.evidence,
        },
      });
      return null;
    }),
});
export const mappedCreatePurchaseV1 = sdk.mapContractVersion({
  contractVersion: createPurchaseV1,
  operations: {
    models: {},
    contracts: { asyncProcessPayment: asyncProcessPaymentV1 },
  },
  result: CreatePurchaseResult,
  program: ({ command, claims, operations }) =>
    Effect.gen(function* () {
      if (command.result.created) {
        yield* operations.contracts.asyncProcessPayment({
          purchaseId: command.result.purchaseId,
          total: command.payload.quote.total,
          key: `shopping:${claims.aggregateId}:${command.result.purchaseId}:payment`,
        });
      }
      return command.result;
    }),
});
export const asyncCreateTrackingLabelV1 = sdk.makeExternalContract({
  name: 'asyncCreateTrackingLabel',
  version: '1.0.0',
  claims: adminClaims,
  payload: { purchaseId, key },
  models: { purchase: purchaseV1 },
  failures: { staleObservation },
  result: Schema.Null,
  external: {
    response: LabelEvidence,
    request: ({ payload }) =>
      ShoppingProviders.use(provider => provider.createLabel(payload)),
  },
  program: ({ payload, response, db, models, failures }) =>
    Effect.gen(function* () {
      const purchase = db.query.purchase
        .findFirst({ where: { id: { eq: payload.purchaseId } } })
        .sync();
      if (
        !purchase ||
        purchase.paymentState !== 'paid' ||
        purchase.labelState !== 'requested' ||
        response.key !== payload.key
      ) {
        return yield* failures.staleObservation.make({
          message:
            'Label evidence no longer matches its paid purchase reservation.',
        });
      }
      yield* models.purchase.update({
        resourceId: purchase.id,
        attributes: {
          labelState: 'ready',
          labelReference: response.labelReference,
          trackingNumber: response.trackingNumber,
          trackingStatus: response.status,
        },
      });
      return null;
    }),
});
export const mappedCreateTrackingLabelV1 = sdk.mapContractVersion({
  contractVersion: createTrackingLabelV1,
  operations: {
    models: {},
    contracts: { asyncCreateTrackingLabel: asyncCreateTrackingLabelV1 },
  },
  result: CreateTrackingLabelResult,
  program: ({ command, claims, operations }) =>
    Effect.gen(function* () {
      if (command.result.reserved) {
        yield* operations.contracts.asyncCreateTrackingLabel({
          purchaseId: command.result.purchaseId,
          key: `shopping:${claims.aggregateId}:${command.result.purchaseId}:label`,
        });
      }
      return command.result;
    }),
});
export const asyncUpdateTrackingInfoV1 = sdk.makeExternalContract({
  name: 'asyncUpdateTrackingInfo',
  version: '1.0.0',
  claims: adminClaims,
  payload: {
    purchaseId,
    key,
    labelReference: sdk.primitives.text(),
    sequence: sdk.primitives.integer(),
  },
  models: { purchase: purchaseV1 },
  failures: { staleObservation },
  result: Schema.Null,
  external: {
    response: TrackingEvidence,
    request: ({ payload }) =>
      ShoppingProviders.use(provider => provider.refresh(payload)),
  },
  program: ({ payload, response, db, models, failures }) =>
    Effect.gen(function* () {
      const purchase = db.query.purchase
        .findFirst({ where: { id: { eq: payload.purchaseId } } })
        .sync();
      if (
        !purchase ||
        purchase.paymentState !== 'paid' ||
        purchase.labelState !== 'ready' ||
        !purchase.trackingRefreshPending ||
        purchase.labelReference !== payload.labelReference ||
        purchase.trackingRefreshSequence !== payload.sequence ||
        response.key !== payload.key ||
        response.labelReference !== payload.labelReference ||
        response.sequence !== payload.sequence
      ) {
        return yield* failures.staleObservation.make({
          message:
            'Tracking evidence does not match the reserved label and refresh sequence.',
        });
      }
      yield* models.purchase.update({
        resourceId: purchase.id,
        attributes: {
          trackingStatus: response.status,
          trackingRefreshPending: false,
        },
      });
      return null;
    }),
});
export const mappedUpdateTrackingInfoV1 = sdk.mapContractVersion({
  contractVersion: updateTrackingInfoV1,
  operations: {
    models: {},
    contracts: { asyncUpdateTrackingInfo: asyncUpdateTrackingInfoV1 },
  },
  result: UpdateTrackingInfoResult,
  program: ({ command, claims, operations }) =>
    Effect.gen(function* () {
      if (command.result.reserved) {
        yield* operations.contracts.asyncUpdateTrackingInfo({
          purchaseId: command.result.purchaseId,
          labelReference: command.result.labelReference,
          sequence: command.result.sequence,
          key: `shopping:${claims.aggregateId}:${command.result.purchaseId}:refresh:${command.result.sequence}`,
        });
      }
      return command.result;
    }),
});
export const fulfillmentContracts = {
  createPurchase: mappedCreatePurchaseV1,
  asyncProcessPayment: asyncProcessPaymentV1,
  createTrackingLabel: mappedCreateTrackingLabelV1,
  asyncCreateTrackingLabel: asyncCreateTrackingLabelV1,
  updateTrackingInfo: mappedUpdateTrackingInfoV1,
  asyncUpdateTrackingInfo: asyncUpdateTrackingInfoV1,
};
