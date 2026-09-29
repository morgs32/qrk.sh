import { definition } from '@zerospin/core/fixtures/shopping';
import { makeZerospinError } from '@zerospin/error';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { connectBrowserNode } from './connectBrowserNode';

const mocks = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock('./Node/nodeNetwork.ts', () => ({
  nodeNetwork: () => ({ snapshot: mocks.snapshot }),
}));
vi.mock('./Node/sessionDiscovery.ts', () => ({
  sessionDiscovery: { revision: async () => 1 },
}));

beforeEach(() => {
  mocks.snapshot.mockReset();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

it.each(['admission', 'snapshot'])(
  'preserves a %s rejection before constructing a SharedWorker',
  async phase => {
    const failure = makeZerospinError({
      code: 'credentials-rejected',
      message: 'Credentials were rejected',
      status: 401,
      extra: { reason: 'expired' },
    });
    const sharedWorker = vi.fn<() => SharedWorker>(() => {
      throw new Error('Must not create a worker before admission succeeds');
    });
    const getAdmission = vi
      .fn<Parameters<typeof connectBrowserNode>[0]['getAdmission']>()
      .mockResolvedValue({
        _tag: 'Success',
        success: { credentials: { token: 'test' } },
      });
    if (phase === 'admission') {
      getAdmission.mockResolvedValue({ _tag: 'Failure', failure });
    } else {
      mocks.snapshot.mockRejectedValue(failure);
    }
    const connection = await connectBrowserNode({
      request: {
        kind: 'aggregate',
        apiUrl: definition.identity.apiUrl,
        publishableKey: definition.identity.publishableKey,
        systemName: definition.identity.systemName,
        targetName: definition.identity.targetName,
        targetVersion: definition.identity.targetVersion,
        sessionName: definition.identity.sessionName,
        lock: { ...definition.lock, contracts: {} },
      },
      sharedWorker,
      getAdmission,
      receive: async () => {},
      state: () => {},
      reconnect: async () => {},
    });
    try {
      await expect(connection.ready()).rejects.toMatchObject({
        code: failure.code,
        message: failure.message,
        status: failure.status,
        extra: failure.extra,
      });
      expect(sharedWorker).not.toHaveBeenCalled();
      if (phase === 'admission') expect(mocks.snapshot).not.toHaveBeenCalled();
    } finally {
      await connection.dispose();
    }
  },
);
