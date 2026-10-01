import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeZerospinError } from '@zerospin/error';
import { Layer, Redacted, Schema } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeSession } from './makeSession/makeSession';

const mocks = vi.hoisted(() => ({
  connect: vi.fn<() => Promise<void>>(),
  ready: vi.fn<() => Promise<void>>(),
  dispose: vi.fn<() => Promise<void>>(),
  deliverSnapshot: false,
  invalidClaims: false,
}));

vi.mock('./connectBrowserNode.ts', async importOriginal => ({
  ...(await importOriginal<typeof import('./connectBrowserNode.ts')>()),
  connectBrowserNode: async (
    props: Parameters<
      typeof import('./connectBrowserNode.ts').connectBrowserNode
    >[0],
  ) => {
    const { request, receive } = props;
    await mocks.connect();
    return {
      ready: async () => {
        await mocks.ready();
        if (mocks.deliverSnapshot) {
          await receive({
            identity: {
              ...request,
              targetId: 'acct_other',
              actorName: 'reader',
              actorVersion: '1.0.0',
              claims: { aggregateId: mocks.invalidClaims ? 42 : 'acct_other' },
              definitionHash: 'test',
            },
            state: {
              localAvailability: 'available',
              authentication: 'remembered',
              synchronization: 'offline',
              blockedWork: false,
              failure: null,
            },
            metadata: {
              id: 1,
              nodeId: 'node_test',
              definitionKey: 'test',
              initialized: true,
              nextNodeIndex: 1,
              outcomeIndex: 0,
              aggregateIndex: 0,
              executedIndex: 0,
              executedHash: 'test',
              pushPaused: false,
            },
            resources: [],
            unresolvedCommands: [],
          });
        }
      },
      dispose: mocks.dispose,
      resnapshot: async () => {},
    };
  },
}));

beforeEach(() => {
  mocks.connect.mockReset().mockResolvedValue();
  mocks.ready.mockReset().mockResolvedValue();
  mocks.dispose.mockReset().mockResolvedValue();
  mocks.deliverSnapshot = false;
  mocks.invalidClaims = false;
});

describe.each(['aggregate', 'service'])('%s startup failures', kind => {
  const common = {
    systemName: 'test',
    sessionName: 'reader',
    actorName: 'reader',
    actorVersion: '1.0.0',
    models: {},
    claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
    layer: Layer.mergeAll(
      Layer.succeed(ZerospinApiUrl, 'http://test'),
      Layer.succeed(PublishableKey, Redacted.make('pk_test')),
    ),
    sharedWorker: () => {
      throw new Error('Mock connection does not construct a worker');
    },
  };
  let session: {
    initialize(input: { claims: { aggregateId: string } }): Promise<void>;
    dispose(): Promise<void>;
  };

  beforeEach(() => {
    session =
      kind === 'aggregate'
        ? makeSession({
            ...common,
            kind: 'aggregate',
            aggregateName: 'test',
            aggregateVersion: '1.0.0',
            contracts: {},
          })
        : makeSession({
            ...common,
            kind: 'service',
            serviceName: 'test',
            serviceVersion: '1.0.0',
          });
  });

  it.each(['connect', 'ready'])(
    'preserves classified %s failures and their diagnostic fields',
    async phase => {
      const failure = makeZerospinError({
        code: 'credentials-rejected',
        message: 'Credentials were rejected',
        status: 403,
        extra: { reason: 'expired' },
        cause: 'Original local diagnostic',
      });
      (phase === 'connect' ? mocks.connect : mocks.ready).mockRejectedValue(
        failure,
      );
      try {
        await expect(
          session.initialize({ claims: { aggregateId: 'acct_test' } }),
        ).rejects.toBe(failure);
        expect(mocks.dispose).toHaveBeenCalledTimes(phase === 'ready' ? 1 : 0);
      } finally {
        await session.dispose();
      }
    },
  );

  it.each(['connect', 'ready'])(
    'classifies unexpected %s exceptions at the owning boundary',
    async phase => {
      const failure = new TypeError('Unexpected startup bug');
      (phase === 'connect' ? mocks.connect : mocks.ready).mockRejectedValue(
        failure,
      );
      try {
        await expect(
          session.initialize({ claims: { aggregateId: 'acct_test' } }),
        ).rejects.toMatchObject({
          code:
            phase === 'connect'
              ? 'node-connection-failed'
              : 'session-initialization-failed',
          message: failure.message,
          cause: failure.stack,
        });
      } finally {
        await session.dispose();
      }
    },
  );

  it('preserves a worker version mismatch', async () => {
    const failure = makeZerospinError('node-worker-version-mismatch');
    mocks.ready.mockRejectedValue(failure);
    try {
      await expect(
        session.initialize({ claims: { aggregateId: 'acct_test' } }),
      ).rejects.toBe(failure);
    } finally {
      await session.dispose();
    }
  });

  it('preserves a local snapshot claims failure and disposes the connection', async () => {
    mocks.deliverSnapshot = true;
    try {
      await expect(
        session.initialize({ claims: { aggregateId: 'acct_test' } }),
      ).rejects.toMatchObject({
        code: 'session-claims-mismatch',
      });
      expect(mocks.dispose).toHaveBeenCalledTimes(1);
    } finally {
      await session.dispose();
    }
  });

  it('classifies an unexpected local snapshot decoding failure as initialization failure', async () => {
    mocks.deliverSnapshot = true;
    mocks.invalidClaims = true;
    try {
      await expect(
        session.initialize({ claims: { aggregateId: 'acct_test' } }),
      ).rejects.toMatchObject({ code: 'session-initialization-failed' });
      expect(mocks.dispose).toHaveBeenCalledTimes(1);
    } finally {
      await session.dispose();
    }
  });
});
