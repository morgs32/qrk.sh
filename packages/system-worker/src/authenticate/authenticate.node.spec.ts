import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { Effect, Result, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { authenticate } from './authenticate.ts';

vi.mock('system', async () => {
  const { authentication } =
    await import('@zerospin/core/authentication/index');
  const { Effect, Schema } = await import('effect');
  const { ZerospinError } = await import('@zerospin/error');
  return {
    system: {
      name: 'auth-test',
      authentication: [
        authentication.makeVersion({
          version: '1.0.0',
          signature: Schema.Struct({ subject: Schema.String }),
          authenticate: ({ signature }) =>
            Effect.succeed(`v1:${signature.subject}`),
        }),
        authentication.makeVersion({
          version: '2.0.0',
          signature: Schema.Struct({ userId: Schema.String }),
          authenticate: ({ signature }) =>
            signature.userId === 'denied'
              ? Effect.fail(
                  new ZerospinError({
                    code: 'authentication-denied',
                    message: 'Denied',
                  }),
                )
              : Effect.succeed(
                  signature.userId === 'empty' ? '' : `v2:${signature.userId}`,
                ),
        }),
        authentication.makeVersion({
          version: '3.0.0',
          signature: Schema.NumberFromString,
          authenticate: ({ signature }) =>
            Effect.succeed(`number:${signature + 1}`),
        }),
      ],
    },
  };
});

describe('independent authentication versions', () => {
  it.each([
    {
      version: '1.0.0',
      schema: Schema.Struct({ subject: Schema.String }),
      signature: { subject: 'alice' },
      userId: 'v1:alice',
    },
    {
      version: '2.0.0',
      schema: Schema.Struct({ userId: Schema.String }),
      signature: { userId: 'alice' },
      userId: 'v2:alice',
    },
    {
      version: '3.0.0',
      schema: Schema.NumberFromString,
      signature: '41',
      userId: 'number:42',
    },
  ])(
    'decodes and executes exactly $version',
    async ({ version, schema, signature, userId }) => {
      const authenticationLock = makeAuthenticationLock({
        version,
        signature: schema,
      });
      const result = await Effect.runPromise(
        authenticate({ authenticationLock, signature }).pipe(
          Effect.provide(AsyncLive),
        ),
      );
      expect(result).toEqual({
        userId,
        authenticationLock,
        systemName: 'auth-test',
      });
    },
  );

  it.each([
    {
      version: '0.0.0',
      schema: Schema.Struct({ subject: Schema.String }),
      signature: { subject: 'alice' },
      code: 'authentication-lock-unsupported',
    },
    {
      version: '1.0.0',
      schema: Schema.Struct({ userId: Schema.String }),
      signature: { userId: 'alice' },
      code: 'authentication-lock-unsupported',
    },
    {
      version: '1.0.0',
      schema: Schema.Struct({ subject: Schema.String }),
      signature: { subject: 1 },
      code: 'authentication-signature-invalid',
    },
    {
      version: '1.0.0',
      schema: Schema.Struct({ subject: Schema.String }),
      signature: { subject: 'alice', extra: true },
      code: 'authentication-signature-invalid',
    },
    {
      version: '2.0.0',
      schema: Schema.Struct({ userId: Schema.String }),
      signature: { userId: 'denied' },
      code: 'authentication-denied',
    },
    {
      version: '2.0.0',
      schema: Schema.Struct({ userId: Schema.String }),
      signature: { userId: 'empty' },
      code: 'system-runtime-authentication-user-invalid',
    },
  ])(
    'rejects $code for $version without fallback',
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
