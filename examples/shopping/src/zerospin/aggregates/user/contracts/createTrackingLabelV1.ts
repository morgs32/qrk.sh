import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { adminClaims } from '../../../claims';
import { purchaseV1 } from '../models/purchase/PurchaseV1';

export const CreateTrackingLabelResult = Schema.Struct({
  purchaseId: Schema.TemplateLiteral(['pur_', Schema.String]),
  reserved: Schema.Boolean,
});

export const createTrackingLabelV1 = sdk.makeContractVersion(
  sdk.defineContract('createTrackingLabel'),
  {
    version: '1.0.0',
    claims: adminClaims,
    payload: { purchaseId: sdk.primitives.foreignKey({ abbreviation: 'pur' }) },
    models: { purchase: purchaseV1 },
    result: CreateTrackingLabelResult,
    failures: {
      ineligible: sdk.ContractError.schema({ code: 'purchase-not-paid' }),
    },
    program: ({ payload, db, models, failures }) =>
      Effect.gen(function* () {
        const purchase = db.query.purchase
          .findFirst({ where: { id: { eq: payload.purchaseId } } })
          .sync();
        if (
          !purchase ||
          purchase.paymentState !== 'paid' ||
          !purchase.paymentReference ||
          !purchase.paymentEvidence
        ) {
          return yield* failures.ineligible.make({
            message:
              'Tracking labels require authoritative successful payment evidence.',
          });
        }
        if (purchase.labelState !== 'none') {
          return { purchaseId: purchase.id, reserved: false };
        }
        yield* models.purchase.update({
          resourceId: purchase.id,
          attributes: { labelState: 'requested' },
        });
        return { purchaseId: purchase.id, reserved: true };
      }),
  },
);
