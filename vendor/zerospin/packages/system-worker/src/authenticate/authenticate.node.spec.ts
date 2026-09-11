import { it as effectIt } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import type { IAuthentication } from '@zerospin/core/authentication/types';
import { ZerospinError } from '@zerospin/error';
import { Effect, Result, Schema } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticate } from './authenticate.ts';

const { onAuthentication, executeAggregateCommand, getRepo } = vi.hoisted(
  () => ({
    onAuthentication: vi.fn<NonNullable<IAuthentication['onAuthentication']>>(),
    executeAggregateCommand: vi.fn(),
    getRepo: vi.fn(),
  }),
);

vi.mock('cloudflare:workers', () => ({
  env: { ZEROSPIN_SYSTEM_ID: 'sys_auth_test' },
}));
vi.mock('../AggregateChain/AggregateChain.js', () => ({
  AggregateChain: { getRepo },
}));

beforeEach(() => {
  onAuthentication.mockReset();
  onAuthentication.mockImplementation(() => Effect.void);
});

vi.mock('system', async () => {
  const { makeAuthenticationVersion } =
    await import('@zerospin/core/authentication/makeVersion');
  const { Effect, Schema } = await import('effect');
  const { ZerospinError } = await import('@zerospin/error');
  return {
    system: {
      name: 'auth-test',
      aggregates: { user: { '1.0.0': {} } },
      authentication: [
        makeAuthenticationVersion({
          version: '1.0.0',
          signature: Schema.Struct({ subject: Schema.String }),
          authenticate: ({ signature }) =>
            Effect.succeed(`v1:${signature.subject}`),
        }),
        makeAuthenticationVersion({
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
          onAuthentication,
        }),
        makeAuthenticationVersion({
          version: '3.0.0',
          signature: Schema.NumberFromString,
          authenticate: ({ signature }) =>
            Effect.succeed(`number:${signature + 1}`),
        }),
      ],
    },
  };
});

effectIt.effect(
  'awaits provisioning on every attempt and binds the verified identity',
  () =>
    Effect.gen(function* () {
      const hookFinished: string[] = [];
      getRepo.mockImplementation(() =>
        Effect.succeed({ executeAggregateCommand }),
      );
      executeAggregateCommand.mockImplementation(async ({ command }) => ({
        _tag: 'Success',
        success: {
          ...command,
          aggregateIndex: 1,
          chainedAt: new Date().toISOString(),
          dispositionHash: 'a'.repeat(64),
          delta: null,
          failedAt: null,
          failure: null,
        },
      }));
      onAuthentication.mockImplementation(
        Effect.fn('test.provision')(function* ({
          userId,
          executeAggregateCommand,
        }) {
          yield* executeAggregateCommand({
            id: 'cmd_provision',
            commandName: 'createUser',
            contractVersion: '1.0.0',
            payload: '{}',
            aggregateId: 'acct_alice',
            aggregateName: 'user',
            aggregateVersion: '1.0.0',
            systemName: 'auth-test',
            userId: 'spoofed',
            sessionId: null,
            frontendName: null,
            pushIndex: null,
          });
          hookFinished.push(userId);
        }),
      );
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = yield* authenticate({
          authenticationLock: makeAuthenticationLock({
            version: '2.0.0',
            signature: Schema.Struct({ userId: Schema.String }),
          }),
          signature: { userId: 'alice' },
        }).pipe(Effect.provide(AsyncLive));
        expect(result.userId).toBe('v2:alice');
        expect(hookFinished).toHaveLength(attempt + 1);
      }
      expect(getRepo).toHaveBeenLastCalledWith({
        key: {
          systemId: 'sys_auth_test',
          aggregateId: 'acct_alice',
          aggregateName: 'user',
        },
      });
      expect(executeAggregateCommand).toHaveBeenLastCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            userId: 'v2:alice',
            sessionId: null,
          }),
        }),
      );
    }),
);

effectIt.effect(
  'propagates provisioning failures and never provisions an invalid identity',
  () =>
    Effect.gen(function* () {
      onAuthentication.mockClear();
      onAuthentication.mockImplementation(() =>
        Effect.fail(
          new ZerospinError({
            code: 'provisioning-failed',
            message: 'Provisioning failed',
          }),
        ),
      );
      const authenticationLock = makeAuthenticationLock({
        version: '2.0.0',
        signature: Schema.Struct({ userId: Schema.String }),
      });
      for (const userId of ['denied', 'empty']) {
        yield* authenticate({ authenticationLock, signature: { userId } }).pipe(
          Effect.provide(AsyncLive),
          Effect.flip,
        );
      }
      expect(onAuthentication).not.toHaveBeenCalled();
      const failure = yield* authenticate({
        authenticationLock,
        signature: { userId: 'alice' },
      }).pipe(Effect.provide(AsyncLive), Effect.flip);
      expect(failure.code).toBe('provisioning-failed');
    }),
);

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
