import type { IAnyError } from '@zerospin/error';
import { Context, Schema, type Effect } from 'effect';

export const PaymentEvidence = Schema.Struct({
  key: Schema.String,
  state: Schema.Literals(['paid', 'declined']),
  reference: Schema.String,
  evidence: Schema.String,
});

export const LabelEvidence = Schema.Struct({
  key: Schema.String,
  labelReference: Schema.String,
  trackingNumber: Schema.String,
  status: Schema.Literal('pre_transit'),
});

export const TrackingEvidence = Schema.Struct({
  key: Schema.String,
  labelReference: Schema.String,
  sequence: Schema.Number,
  status: Schema.Literals(['in_transit', 'delivered']),
});

export class ShoppingProviders extends Context.Service<
  ShoppingProviders,
  {
    pay(input: {
      key: string;
      total: number;
    }): Effect.Effect<typeof PaymentEvidence.Type, IAnyError>;
    createLabel(input: {
      key: string;
    }): Effect.Effect<typeof LabelEvidence.Type, IAnyError>;
    refresh(input: {
      key: string;
      labelReference: string;
      sequence: number;
    }): Effect.Effect<typeof TrackingEvidence.Type, IAnyError>;
  }
>()('ShoppingProviders') {}
