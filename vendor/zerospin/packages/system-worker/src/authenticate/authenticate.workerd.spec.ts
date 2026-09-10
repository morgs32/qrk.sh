import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Result, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { authenticate } from './authenticate.ts';

// The frontend authors its own version and schema; it does not import the authenticator.
const frontendAuthentication = {
  version: '1.0.0',
  signature: Schema.Struct({ userId: makeAbbreviationIdSchema('usr') }),
};

describe('frontend authentication lock in Workers', () => {
  it('authenticates an independently authored lock and encoded signature', async () => {
    const authenticationLock = makeAuthenticationLock(frontendAuthentication);
    const signature = Schema.encodeSync(frontendAuthentication.signature)({
      userId: 'usr_authentication',
    });
    const result = await Effect.runPromise(
      authenticate({ authenticationLock, signature }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    expect(result).toEqual({
      userId: 'usr_authentication',
      authenticationLock,
      systemName: 'system-worker',
    });
  });

  it.each([
    {
      version: '9.0.0',
      schema: frontendAuthentication.signature,
      signature: { userId: 'usr_authentication' },
      code: 'authentication-lock-unsupported',
    },
    {
      version: '1.0.0',
      schema: Schema.Struct({ userId: Schema.String }),
      signature: { userId: 'usr_authentication' },
      code: 'authentication-lock-unsupported',
    },
    {
      version: '1.0.0',
      schema: frontendAuthentication.signature,
      signature: { userId: 12 },
      code: 'authentication-signature-invalid',
    },
  ])(
    'rejects $code at the Worker boundary',
    async ({ version, schema, signature, code }) => {
      const result = await Effect.runPromise(
        authenticate({
          authenticationLock: makeAuthenticationLock({
            version,
            signature: schema,
          }),
          signature,
        }).pipe(Effect.provide(AsyncLive), Effect.result),
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) expect(result.failure.code).toBe(code);
    },
  );
});
