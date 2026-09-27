import { PaymentProvider } from '@zerospin/purchase/server';
import { Effect, Layer } from 'effect';
export const PaymentProviderLive = Layer.succeed(PaymentProvider, request =>
  Effect.gen(function* () {
    yield* Effect.sleep('5 seconds');
    return {
      outcome: 'succeeded' as const,
      providerReference: `mock_${request.paymentIntentId}`,
    };
  }),
);
