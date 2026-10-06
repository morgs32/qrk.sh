import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { adminClaims } from '../../../claims';
import { PurchaseQuote } from '../../../purchaseQuote';
import { purchaseV1 } from '../models/purchase/PurchaseV1';
import { purchaseItemV1 } from '../models/purchaseItem/PurchaseItemV1';

export const CreatePurchaseResult = Schema.Struct({
  purchaseId: Schema.TemplateLiteral(['pur_', Schema.String]),
  created: Schema.Boolean,
});

export const createPurchaseV1 = sdk.makeContractVersion(
  sdk.defineContract('createPurchase'),
  {
    version: '1.0.0',
    claims: adminClaims,
    payload: { quote: sdk.primitives.json({ schema: PurchaseQuote }) },
    models: { purchase: purchaseV1, purchaseItem: purchaseItemV1 },
    result: CreatePurchaseResult,
    failures: {
      invalidQuote: sdk.ContractError.schema({
        code: 'invalid-purchase-quote',
      }),
    },
    program: ({ payload: { quote }, db, models, failures }) =>
      Effect.gen(function* () {
        const existing = db.query.purchase
          .findFirst({
            where: { id: { eq: quote.purchaseId } },
            with: { items: true },
          })
          .sync();
        if (
          quote.items.length === 0 ||
          quote.total !==
            quote.items.reduce(
              (sum, item) => sum + item.price * item.quantity,
              0,
            ) ||
          new Set(quote.items.map(item => item.id)).size !== quote.items.length
        ) {
          return yield* failures.invalidQuote.make({
            message: 'A purchase requires a complete, consistent frozen quote.',
          });
        }
        if (existing) {
          const retained = existing.items
            .map(({ id, productId, name, price, quantity }) => ({
              id,
              productId,
              name,
              price,
              quantity,
            }))
            .sort((a, b) => a.id.localeCompare(b.id));
          const incoming = [...quote.items].sort((a, b) =>
            a.id.localeCompare(b.id),
          );
          if (
            existing.total !== quote.total ||
            JSON.stringify(retained) !== JSON.stringify(incoming)
          ) {
            return yield* failures.invalidQuote.make({
              message: 'Purchase identity already retains a different quote.',
            });
          }
          return { purchaseId: quote.purchaseId, created: false };
        }
        yield* models.purchase.create({
          resourceId: quote.purchaseId,
          attributes: {
            total: quote.total,
            paymentState: 'pending',
            paymentReference: null,
            paymentEvidence: null,
            labelState: 'none',
            labelReference: null,
            trackingNumber: null,
            trackingStatus: null,
            trackingRefreshSequence: 0,
            trackingRefreshPending: false,
          },
        });
        for (const item of quote.items) {
          yield* models.purchaseItem.create({
            resourceId: item.id,
            attributes: {
              purchaseId: quote.purchaseId,
              productId: item.productId,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
            },
          });
        }
        return { purchaseId: quote.purchaseId, created: true };
      }),
  },
);
