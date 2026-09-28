import { fixture } from '@zerospin/core/fixtures/nodeFixture';
import { definition } from '@zerospin/core/fixtures/shopping';
import { describe, expect, it, vi } from 'vitest';

import { NodeAuthentication } from './NodeAuthentication.ts';

describe('node authentication', () => {
  it('shares attempts and accepts the first matching server-verified responder despite a frozen tab', async () => {
    const auth = new NodeAuthentication(
      definition.identity,
      async admission => ({
        status: 'verified',
        value: { admission, identity: definition.identity },
      }),
    );
    auth.register({}, () => new Promise(() => undefined));
    auth.register({}, async () => ({ credentials: { token: 'signature' } }));
    const first = auth.authenticate();
    expect(auth.authenticate()).toBe(first);
    expect((await first).admission).toEqual({
      credentials: { token: 'signature' },
    });
  });

  it('does not bind a command node to another authenticated identity', async () => {
    const auth = new NodeAuthentication(
      definition.identity,
      async admission => ({
        status: 'verified',
        value: {
          admission,
          identity: {
            ...definition.identity,
            claims: { userId: 'two' },
          },
        },
      }),
    );
    auth.register({}, async () => ({ credentials: { token: 'wrong' } }));
    await expect(auth.authenticate()).rejects.toMatchObject({
      code: 'node-authentication-rejected',
    });
    await expect(
      auth.resume({ ...definition.identity, targetId: 'acct_other' }),
    ).rejects.toMatchObject({ code: 'node-authentication-identity-mismatch' });
  });

  it('invalidates outstanding authentication on sign-out', async () => {
    const auth = new NodeAuthentication(definition.identity, async () => ({
      status: 'unavailable',
    }));
    auth.register({}, () => new Promise(() => undefined));
    const attempt = auth.authenticate();
    auth.clear();
    await expect(attempt).rejects.toMatchObject({
      code: 'node-authentication-cancelled',
    });
    await expect(auth.authenticate()).rejects.toMatchObject({
      code: 'node-signed-out',
    });
  });
});

it('bounds frozen authentication waits without accumulating pending calls', async () => {
  vi.useFakeTimers();
  try {
    const started = Promise.withResolvers<void>();
    let calls = 0;
    const auth = new NodeAuthentication(
      definition.identity,
      async () => ({ status: 'unavailable' }),
      100,
    );
    auth.register({}, () => {
      calls += 1;
      started.resolve();
      return new Promise(() => undefined);
    });
    const first = expect(auth.authenticate()).rejects.toMatchObject({
      code: 'node-authentication-unavailable',
    });
    await started.promise;
    await vi.advanceTimersByTimeAsync(100);
    await first;
    const secondAttempt = auth.authenticate();
    const second = expect(secondAttempt).rejects.toMatchObject({
      code: 'node-authentication-unavailable',
    });
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1));
    await vi.advanceTimersByTimeAsync(100);
    await second;
    expect(calls).toBe(1);
  } finally {
    vi.useRealTimers();
  }
});

it('cannot resurrect signed-out authentication through an in-flight resume', async () => {
  const auth = new NodeAuthentication(definition.identity, async () => ({
    status: 'unavailable',
  }));
  const resume = auth.resume(definition.identity);
  auth.clear();
  await expect(resume).rejects.toMatchObject({
    code: 'node-authentication-cancelled',
  });
  await expect(auth.authenticate()).rejects.toMatchObject({
    code: 'node-signed-out',
  });
  const { node, sqlite } = await fixture();
  try {
    await node.clearAuthentication();
    await expect(
      node.authenticated(definition.identity, () => false),
    ).rejects.toMatchObject({ code: 'node-authentication-cancelled' });
    expect(node.status().authentication).toBe('signed-out');
  } finally {
    sqlite.close();
  }
});
