import { env } from 'cloudflare:workers';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';

import { checkSecretApiKey } from './checkSecretApiKey.js';

describe('checkSecretApiKey', () => {
  beforeEach(() => {
    env.ZEROSPIN_PUBLISHABLE_KEY = 'pk_gateway_test';
    env.ZEROSPIN_SECRET_KEY = 'sk_gateway_test';
  });

  it('accepts secret-prefixed development keys and rejects every other key', async () => {
    env.ZEROSPIN_ENVIRONMENT = 'dev';

    await expect(
      Effect.runPromise(checkSecretApiKey('sk_local')),
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(checkSecretApiKey('local-publishable-key')),
    ).rejects.toMatchObject({ code: 'publishable-key-not-allowed' });
  });

  it('requires the configured production secret key', async () => {
    env.ZEROSPIN_ENVIRONMENT = 'production';

    await expect(
      Effect.runPromise(checkSecretApiKey('sk_gateway_test')),
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(checkSecretApiKey('pk_gateway_test')),
    ).rejects.toMatchObject({ code: 'publishable-key-not-allowed' });
    await expect(
      Effect.runPromise(checkSecretApiKey('invalid-key')),
    ).rejects.toMatchObject({
      code: 'production-api-key-invalid',
      status: 401,
    });
  });
});
