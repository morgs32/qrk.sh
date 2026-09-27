import { makeZerospinError } from '@zerospin/error';
import {
  command,
  database,
  definition,
} from '@zerospin/fixtures/browser/nodeFixture';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NodeCatalog } from './NodeCatalog.ts';
import { NodeHost } from './NodeHost.ts';
import type { INodeRequest } from './nodeRequest.ts';
import { NodeSynchronization } from './NodeSynchronization.ts';

const network = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock('./nodeNetwork.ts', () => ({
  nodeNetwork: (request: unknown, signature: unknown) => ({
    snapshot: () => network.snapshot(request, signature),
  }),
}));
const request: INodeRequest = {
  kind: 'aggregate',
  apiUrl: definition.identity.apiUrl,
  publishableKey: definition.identity.publishableKey,
  systemName: 'test',
  targetName: 'account',
  targetVersion: 'v1',
  sessionName: 'editor',
  lock: { ...definition.lock, contracts: {} },
};
const snapshot = {
  claims: definition.identity.claims,
  aggregateId: 'acct_test',
};
const fixture = async () => {
  const catalogDb = database();
  const catalog = new NodeCatalog(catalogDb.db);
  await catalog.initialize();
  const stores = new Map<string, ReturnType<typeof database>>();
  const host = new NodeHost(catalog, async key => {
    let store = stores.get(key);
    if (store === undefined) {
      store = database();
      stores.set(key, store);
    }
    return store.db;
  });
  return {
    host,
    catalog,
    close: () => {
      catalogDb.sqlite.close();
      for (const store of stores.values()) store.sqlite.close();
    },
  };
};
beforeEach(() => {
  network.snapshot.mockReset().mockResolvedValue(snapshot);
  vi.spyOn(NodeSynchronization.prototype, 'resume').mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());

describe('node attachment identity and catalog', () => {
  it('rejects an offline node whose saved identity differs from the captured direct claims', async () => {
    const { host, close } = await fixture();
    try {
      const first = await host.attach(
        request,
        {},
        async () => ({ claims: { userId: 'one' } }),
        { userId: 'one' },
      );
      network.snapshot.mockRejectedValue(
        makeZerospinError({ code: 'async-failed' }),
      );
      await expect(
        host.attach(request, {}, async () => ({ claims: { userId: 'two' } }), {
          userId: 'two',
        }),
      ).rejects.toMatchObject({ code: 'session-claims-mismatch' });
      first.detach();
    } finally {
      close();
    }
  });

  it('uses offline identity only for transient failure and keeps commands across sign-out and verified login', async () => {
    const { host, catalog, close } = await fixture();
    try {
      const first = await host.attach(request, {}, async () => ({
        credentials: { token: 'signature' },
      }));
      const accepted = await first.node.accept(command('one'));
      network.snapshot.mockRejectedValue(
        makeZerospinError({ code: 'async-failed' }),
      );
      const offline = await host.attach(request, {}, async () => ({
        credentials: { token: 'signature' },
      }));
      expect(offline.node).toBe(first.node);
      network.snapshot.mockRejectedValue(
        makeZerospinError({ code: 'authentication-rejected' }),
      );
      await expect(
        host.attach(request, {}, async () => ({
          credentials: { token: 'signature' },
        })),
      ).rejects.toMatchObject({ code: 'authentication-rejected' });
      await first.clearAuthentication();
      expect(
        await catalog.reopenOffline(first.node.definition.identity),
      ).toBeNull();
      expect(
        (await first.node.history({ afterNodeIndex: 0, limit: 10 }))[0],
      ).toEqual(accepted);
      network.snapshot.mockRejectedValue(
        makeZerospinError({ code: 'async-failed' }),
      );
      await expect(
        host.attach(request, {}, async () => ({
          credentials: { token: 'signature' },
        })),
      ).rejects.toMatchObject({ code: 'async-failed' });
      network.snapshot.mockResolvedValue(snapshot);
      const loggedIn = await host.attach(request, {}, async () => ({
        credentials: { token: 'new signature' },
      }));
      expect(loggedIn.node).toBe(first.node);
      expect(loggedIn.node.status().authentication).toBe('verified');
      first.detach();
      offline.detach();
      loggedIn.detach();
    } finally {
      close();
    }
  });

  it('rejects a late initial authentication result after sign-out without restoring an offline locator', async () => {
    const { host, catalog, close } = await fixture();
    try {
      const first = await host.attach(request, {}, async () => ({
        credentials: { token: 'signature' },
      }));
      const pending = Promise.withResolvers<typeof snapshot>();
      network.snapshot.mockReturnValue(pending.promise);
      const late = host.attach(request, {}, async () => ({
        credentials: { token: 'late' },
      }));
      const rejected = expect(late).rejects.toMatchObject({
        code: 'node-authentication-cancelled',
      });
      await vi.waitFor(() =>
        expect(network.snapshot).toHaveBeenCalledWith(request, {
          credentials: { token: 'late' },
        }),
      );
      await first.clearAuthentication();
      pending.resolve(snapshot);
      await rejected;
      expect(
        await catalog.reopenOffline(first.node.definition.identity),
      ).toBeNull();
      first.detach();
    } finally {
      close();
    }
  });
  it('discovers older definitions and reports blocked work without rebinding its identity', async () => {
    const { host, close } = await fixture();
    try {
      const first = await host.attach(request, {}, async () => ({
        credentials: { token: 'one' },
      }));
      const retained = await first.node.accept(command('old'));
      network.snapshot
        .mockClear()
        .mockResolvedValue({ ...snapshot, claims: { userId: 'two' } });
      const second = await host.attach(
        { ...request, lock: { ...request.lock, actorVersion: 'v2' } },
        {},
        async () => ({ credentials: { token: 'two' } }),
      );
      expect(second.node).not.toBe(first.node);
      await vi.waitFor(() =>
        expect(second.node.status().retainedNodes).toMatchObject([
          { nodeId: retained.nodeId, unresolvedCommands: 1, blockedWork: true },
        ]),
      );
      expect(first.node.definition.lock.actorVersion).toBe('v1');
      expect(first.node.definition.identity.claims).toEqual({
        userId: 'one',
      });
      expect(
        await first.node.history({ afterNodeIndex: 0, limit: 10 }),
      ).toEqual([retained]);
      expect(
        network.snapshot.mock.calls.some(
          ([request]) => request.lock.actorVersion === 'v1',
        ),
      ).toBe(true);
      first.detach();
      second.detach();
    } finally {
      close();
    }
  });
});
