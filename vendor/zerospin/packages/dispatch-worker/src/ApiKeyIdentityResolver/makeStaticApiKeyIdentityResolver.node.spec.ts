import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { ApiKeyIdentityResolver } from './ApiKeyIdentityResolver';
import { makeStaticApiKeyIdentityResolver } from './makeStaticApiKeyIdentityResolver';

const resolveWith = (apiKey: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const resolver = yield* ApiKeyIdentityResolver;
      return yield* resolver.resolve({ apiKey });
    }).pipe(
      Effect.provide(
        makeStaticApiKeyIdentityResolver({
          systemId: 'sys_test_1',
          deployName: 'happy_blue_whale_ab',
          clerkUserId: 'user_e2e_test',
        }),
      ),
      Effect.provide(AsyncLive),
    ),
  );

describe('makeStaticApiKeyIdentityResolver', () => {
  it('returns the configured dev identity for a publishable key', async () => {
    const identity = await resolveWith('pk_test');
    expect(identity).toEqual({
      organizationId: 'org_test',
      systemId: 'sys_test_1',
      systemEnvironmentId: 'dev',
      keyType: 'publishable',
      keyPairName: 'happy_blue_whale_ab',
      clerkUserId: 'user_e2e_test',
    });
  });

  it('classifies sk_-prefixed keys as secret', async () => {
    const identity = await resolveWith('sk_test');
    expect(identity.keyType).toBe('secret');
  });

  it('uses an explicitly configured key type for an arbitrary key', async () => {
    const identity = await Effect.runPromise(
      Effect.gen(function* () {
        const resolver = yield* ApiKeyIdentityResolver;
        return yield* resolver.resolve({ apiKey: 'shopping-example-key' });
      }).pipe(
        Effect.provide(
          makeStaticApiKeyIdentityResolver({
            systemId: 'sys_test_1',
            deployName: 'shopping-example',
            clerkUserId: 'shopping-example',
            keyType: 'secret',
          }),
        ),
        Effect.provide(AsyncLive),
      ),
    );

    expect(identity.keyType).toBe('secret');
  });
});
