import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeStaticApiKeyIdentityResolver } from './makeStaticApiKeyIdentityResolver';

const resolveWith = (apiKey: string) =>
  Effect.runPromise(
    makeStaticApiKeyIdentityResolver({
      systemId: 'sys_test_1',
    })
      .resolve({ apiKey })
      .pipe(Effect.provide(AsyncLive)),
  );

describe('makeStaticApiKeyIdentityResolver', () => {
  it('returns the configured dev identity for a publishable key', async () => {
    const identity = await resolveWith('pk_test');
    expect(identity).toEqual({
      systemId: 'sys_test_1',
      systemWorkerName: 'sys_test_1',
      systemEnvironmentId: 'dev',
      keyType: 'publishable',
    });
  });

  it('classifies sk_-prefixed keys as secret', async () => {
    const identity = await resolveWith('sk_test');
    expect(identity.keyType).toBe('secret');
  });

  it('uses an explicitly configured key type for an arbitrary key', async () => {
    const identity = await Effect.runPromise(
      makeStaticApiKeyIdentityResolver({
        systemId: 'sys_test_1',
        keyType: 'secret',
      })
        .resolve({ apiKey: 'shopping-example-key' })
        .pipe(Effect.provide(AsyncLive)),
    );

    expect(identity.keyType).toBe('secret');
  });
});
