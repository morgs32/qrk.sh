import { ZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

/*
 * GatewayApi uses this check before granting a system capability.
 * Development uses a prefix policy; production requires the configured secret key.
 *
 * 1. Select the environment policy.
 * 2. Accept development secret keys.
 * 3. Accept the configured secret key.
 * 4. Reject the production publishable key.
 * 5. Reject every other production key.
 */
export const checkSecretApiKey = Effect.fn('GatewayApi.checkSecretApiKey')(
  function* (apiKey: string) {
    // 1 — development checks key prefixes; production compares configured keys
    if (env.ZEROSPIN_ENVIRONMENT === 'dev') {
      // 2 — require the sk_ prefix in development
      if (apiKey.startsWith('sk_')) {
        return;
      }
      return yield* new ZerospinError({
        code: 'publishable-key-not-allowed',
        message: 'A secret API key is required',
      });
    }

    // 3 — match ZEROSPIN_SECRET_KEY exactly
    if (apiKey === env.ZEROSPIN_SECRET_KEY) {
      return;
    }

    // 4 — prevent frontend credentials from acquiring SystemApi
    if (apiKey === env.ZEROSPIN_PUBLISHABLE_KEY) {
      return yield* new ZerospinError({
        code: 'publishable-key-not-allowed',
        message: 'A secret API key is required',
      });
    }

    // 5 — return production-api-key-invalid with HTTP status 401
    return yield* new ZerospinError({
      code: 'production-api-key-invalid',
      message: 'The API key does not match this production deployment',
      status: 401,
    });
  },
);
