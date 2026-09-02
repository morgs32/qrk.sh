import { env } from 'cloudflare:workers';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';

import { checkPublishableApiKey } from './checkPublishableApiKey.js';

describe('checkPublishableApiKey', () => {
  beforeEach(() => {
    env.ZEROSPIN_PUBLISHABLE_KEY = 'pk_gateway_test';
    env.ZEROSPIN_SECRET_KEY = 'sk_gateway_test';
  });

  it('accepts every non-secret key in development and rejects secret keys', async () => {
    env.ZEROSPIN_ENVIRONMENT = 'dev';

    await expect(
      Effect.runPromise(checkPublishableApiKey('local-publishable-key')),
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(checkPublishableApiKey('sk_gateway_test')),
    ).rejects.toMatchObject({ code: 'secret-key-not-allowed' });
  });

  it('requires the configured production publishable key', async () => {
    env.ZEROSPIN_ENVIRONMENT = 'production';

    await expect(
      Effect.runPromise(checkPublishableApiKey('pk_gateway_test')),
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(checkPublishableApiKey('sk_gateway_test')),
    ).rejects.toMatchObject({ code: 'secret-key-not-allowed' });
    await expect(
      Effect.runPromise(checkPublishableApiKey('invalid-key')),
    ).rejects.toMatchObject({
      code: 'production-api-key-invalid',
      status: 401,
    });
  });
});
