import { Effect, Layer } from 'effect';

import { ShoppingProviders } from './ShoppingProviders';

/** Example provider evidence is a pure function of its business identity, so response loss is safely reconciled on retry. */
export const ShoppingProvidersLive = Layer.succeed(ShoppingProviders, {
  pay: ({ key, total }) =>
    Effect.succeed({
      key,
      state: 'paid',
      reference: `payment:${key}`,
      evidence: `example-payment:${total}:USD`,
    }),
  createLabel: ({ key }) =>
    Effect.succeed({
      key,
      labelReference: `label:${key}`,
      trackingNumber: `DEMO-${key}`,
      status: 'pre_transit',
    }),
  refresh: ({ key, labelReference, sequence }) =>
    Effect.succeed({
      key,
      labelReference,
      sequence,
      status: sequence === 1 ? 'in_transit' : 'delivered',
    }),
});
