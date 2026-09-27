import type { IAnyError } from '@zerospin/error';
import '@zerospin/server-only';
import { Context, type Effect } from 'effect';

import type { PurchaseQuoteSchema } from './quote.js';
export class PaymentProvider extends Context.Service<
  PaymentProvider,
  (request: {
    paymentIntentId: `pmt_${string}`;
    purchaseId: `pur_${string}`;
    quote: typeof PurchaseQuoteSchema.Type;
  }) => Effect.Effect<
    {
      outcome: 'succeeded' | 'declined' | 'uncertain';
      providerReference: string;
    },
    IAnyError
  >
>()('PurchasePaymentProvider') {}
export type IPromotionReceipt = {
  status: 'reserved' | 'committed' | 'released' | 'redeemed' | 'denied';
  expiresAt: number | null;
  purchaseId: `pur_${string}` | null;
};
export class PromotionProvider extends Context.Service<
  PromotionProvider,
  (request: {
    action: 'reserve' | 'commit' | 'release' | 'redeem';
    aggregateId: string;
    cartId: `crt_${string}`;
    reservationId: `prv_${string}`;
    purchaseId: `pur_${string}` | null;
  }) => Effect.Effect<
    | { kind: 'confirmed'; receipt: IPromotionReceipt }
    | { kind: 'rejected'; reason: string },
    IAnyError
  >
>()('PurchasePromotionProvider') {}
