import * as sdk from '@zerospin/sdk/browser';
import { Layer, Redacted } from 'effect';

export const applicationLayer = Layer.mergeAll(
  Layer.succeed(
    sdk.ZerospinApiUrl,
    import.meta.env.VITE_ZEROSPIN_API_URL ?? 'http://localhost:3006',
  ),
  Layer.succeed(
    sdk.PublishableKey,
    Redacted.make(import.meta.env.VITE_ZEROSPIN_PUBLISHABLE_KEY ?? ''),
  ),
);
