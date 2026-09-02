import { ZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

export const checkSecretApiKey = Effect.fn('GatewayApi.checkSecretApiKey')(
  function* (apiKey: string) {
    if (env.ZEROSPIN_ENVIRONMENT === 'dev') {
      if (apiKey.startsWith('sk_')) {
        return;
      }
      return yield* new ZerospinError({
        code: 'publishable-key-not-allowed',
        message: 'A secret API key is required',
      });
    }
    if (apiKey === env.ZEROSPIN_SECRET_KEY) {
      return;
    }
    if (apiKey === env.ZEROSPIN_PUBLISHABLE_KEY) {
      return yield* new ZerospinError({
        code: 'publishable-key-not-allowed',
        message: 'A secret API key is required',
      });
    }
    return yield* new ZerospinError({
      code: 'production-api-key-invalid',
      message: 'The API key does not match this production deployment',
      status: 401,
    });
  },
);
