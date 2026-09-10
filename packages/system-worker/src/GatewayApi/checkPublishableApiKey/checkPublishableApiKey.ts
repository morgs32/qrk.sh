import { ZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

/*
 * GatewayApi uses this check before granting a frontend capability.
 * Development uses a prefix policy; production requires the configured publishable key.
 *
 * 1. Select the environment policy.
 * 2. Accept development publishable keys.
 * 3. Reject the production secret key.
 * 4. Accept the configured publishable key.
 * 5. Reject every other production key.
 */
export const checkPublishableApiKey = Effect.fn(
  'GatewayApi.checkPublishableApiKey',
)(function* (apiKey: string) {
  // 1 — development checks key prefixes; production compares configured keys
  if (env.ZEROSPIN_ENVIRONMENT === 'dev') {
    // 2 — allow any development key without the sk_ prefix
    if (!apiKey.startsWith('sk_')) {
      return;
    }
    return yield* new ZerospinError({
      code: 'secret-key-not-allowed',
      message: 'A publishable API key is required',
    });
  }

  // 3 — prevent a secret key from acquiring a frontend capability
  if (apiKey === env.ZEROSPIN_SECRET_KEY) {
    return yield* new ZerospinError({
      code: 'secret-key-not-allowed',
      message: 'A publishable API key is required',
    });
  }

  // 4 — match ZEROSPIN_PUBLISHABLE_KEY exactly
  if (apiKey === env.ZEROSPIN_PUBLISHABLE_KEY) {
    return;
  }

  // 5 — return production-api-key-invalid with HTTP status 401
  return yield* new ZerospinError({
    code: 'production-api-key-invalid',
    message: 'The API key does not match this production deployment',
    status: 401,
  });
});
