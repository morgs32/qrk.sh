import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { adminClaims } from '../../../claims';
import { purchaseV1 } from '../models/purchase/PurchaseV1';

export const UpdateTrackingInfoResult = Schema.Struct({
  purchaseId: Schema.TemplateLiteral(['pur_', Schema.String]),
  reserved: Schema.Boolean,
  labelReference: Schema.String,
  sequence: Schema.Number,
});

export const updateTrackingInfoV1 = sdk.makeContractVersion(
  sdk.defineContract('updateTrackingInfo'),
  {
    version: '1.0.0',
    claims: adminClaims,
    payload: { purchaseId: sdk.primitives.foreignKey({ abbreviation: 'pur' }) },
    models: { purchase: purchaseV1 },
    result: UpdateTrackingInfoResult,
    failures: {
      unavailable: sdk.ContractError.schema({
        code: 'tracking-label-unavailable',
      }),
    },
    program: ({ payload, db, models, failures }) =>
      Effect.gen(function* () {
        const purchase = db.query.purchase
          .findFirst({ where: { id: { eq: payload.purchaseId } } })
          .sync();
        if (
          !purchase ||
          purchase.paymentState !== 'paid' ||
          purchase.labelState !== 'ready' ||
          !purchase.labelReference
        ) {
          return yield* failures.unavailable.make({
            message:
              'Tracking refresh requires a ready label on a paid purchase.',
          });
        }
        if (purchase.trackingRefreshPending) {
          return {
            purchaseId: purchase.id,
            reserved: false,
            labelReference: purchase.labelReference,
            sequence: purchase.trackingRefreshSequence,
          };
        }
        const sequence = purchase.trackingRefreshSequence + 1;
        yield* models.purchase.update({
          resourceId: purchase.id,
          attributes: {
            trackingRefreshSequence: sequence,
            trackingRefreshPending: true,
          },
        });
        return {
          purchaseId: purchase.id,
          reserved: true,
          labelReference: purchase.labelReference,
          sequence,
        };
      }),
  },
);
