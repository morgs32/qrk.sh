import * as sdk from '@zerospin/sdk/browser';
import { Layer, Redacted } from 'effect';

const zerospinApiUrl = import.meta.env.VITE_ZEROSPIN_API_URL;
const zerospinPublishableKey = import.meta.env.VITE_ZEROSPIN_PUBLISHABLE_KEY;

if (!zerospinApiUrl) {
  throw new Error('Set VITE_ZEROSPIN_API_URL for the shopping app.');
}

if (!zerospinPublishableKey) {
  throw new Error('Set VITE_ZEROSPIN_PUBLISHABLE_KEY for the shopping app.');
}

export const applicationLayer = Layer.mergeAll(
  Layer.succeed(sdk.ZerospinApiUrl, zerospinApiUrl),
  Layer.succeed(sdk.PublishableKey, Redacted.make(zerospinPublishableKey)),
);
