import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { makeZerospinApp } from '@zerospin/react';
import { Layer, ManagedRuntime, Redacted } from 'effect';

import { signature } from './signature';
import { catalog as catalogFrontend } from './frontends/catalog';
import { web as shopperFrontend } from './frontends/web';

const zerospinApiUrl = import.meta.env.VITE_ZEROSPIN_API_URL;
const zerospinPublishableKey = import.meta.env.VITE_ZEROSPIN_PUBLISHABLE_KEY;

if (!zerospinApiUrl) {
  throw new Error('Set VITE_ZEROSPIN_API_URL for the shopping app.');
}

if (!zerospinPublishableKey) {
  throw new Error('Set VITE_ZEROSPIN_PUBLISHABLE_KEY for the shopping app.');
}

const sessionRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    AsyncLive,
    NanoIdFactory,
    UlidMonotonicFactory,
    Layer.succeed(ZerospinApiUrl, zerospinApiUrl),
    Layer.succeed(PublishableKey, Redacted.make(zerospinPublishableKey)),
  ),
);

export const ZerospinApp = makeZerospinApp({
  systemName: 'shopping',
  authentication: {
    signature,
  },
  frontends: {
    web: {
      controller: shopperFrontend,
      contracts: {
        updateCartItemQuantity: '1.0.0',
      },
    },
    catalog: {
      controller: catalogFrontend,
    },
  },
  runtime: sessionRuntime,
});
