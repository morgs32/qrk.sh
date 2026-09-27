import { it } from '@effect/vitest';
import type { IBackupWorker } from '@zerospin/backup-worker';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { Context, Effect, Layer, Redacted, Schema } from 'effect';
import { afterEach, describe, expect, vi } from 'vitest';

import { makeStandaloneSession } from '../makeStandaloneSession/makeStandaloneSession';

import { makeSession } from './makeSession';

const connections = vi.hoisted(() => ({
  opened: 0,
  closed: 0,
  snapshots: new Map<string, Uint8Array>(),
  appliedParameters: new Array<readonly unknown[]>(),
  failSessionCleanup: false,
}));
vi.mock('@zerospin/backup-worker', async () => {
  const { Effect } = await import('effect');
  const worker: IBackupWorker = {
    onDisconnect: () => () => {},
    acquireDb: ({ backupKey }) =>
      Effect.sync(() => ({
        status: 'acquired',
        snapshot: connections.snapshots.get(backupKey) ?? null,
        db: {
          overwriteDb: ({ snapshot }) =>
            Effect.sync(() => {
              connections.snapshots.set(backupKey, snapshot.slice());
            }),
          applyStatements: ({ statements }) =>
            Effect.sync(() => {
              for (const statement of statements) {
                connections.appliedParameters.push(statement.parameters);
              }
            }),
          exportSnapshot: () =>
            Effect.sync(() => connections.snapshots.get(backupKey) ?? null),
          dispose: () => Effect.void,
        },
      })),
  };
  return {
    acquireBackupWorker: () =>
      Effect.acquireRelease(
        Effect.sync(() => {
          connections.opened++;
          return worker;
        }),
        () =>
          Effect.sync(() => {
            connections.closed++;
          }),
      ),
  };
});
vi.mock('../bootstrapServiceSession.ts', async () => {
  const { Effect } = await import('effect');
  return {
    bootstrapServiceSession: (
      props: Parameters<
        typeof import('../bootstrapServiceSession').bootstrapServiceSession
      >[0],
    ) =>
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() => {
          if (connections.failSessionCleanup) {
            connections.failSessionCleanup = false;
            return Effect.die('session-cleanup-failed');
          }
          return Effect.void;
        });
        props.session.store.setState({
          isInitialized: true,
          sessionStatus: 'current',
        });
        return { clearAuthentication: async () => {}, history: async () => [] };
      }),
  };
});
vi.mock('../bootstrapAggregateSession.ts', async () => {
  const { Effect } = await import('effect');
  return {
    bootstrapAggregateSession: (
      props: Parameters<
        typeof import('../bootstrapAggregateSession').bootstrapAggregateSession
      >[0],
    ) =>
      Effect.gen(function* () {
        props.session.store.setState({
          isInitialized: true,
          sessionStatus: 'current',
        });
        return {
          clearAuthentication: async () => {},
          history: async () => [],
          executeAggregateSessionCommand: ({
            command,
          }: {
            command: { id: string };
          }) => Effect.succeed({ commandId: command.id }),
          getPushPaused: Effect.succeed(false),
          setPushPaused: () => Effect.void,
          pushNow: Effect.succeed({ status: 'empty' }),
        };
      }),
  };
});

const claims = Schema.Struct({ aggregateId: Schema.String });
const apiLayer = Layer.mergeAll(
  Layer.succeed(ZerospinApiUrl, 'http://localhost:3005'),
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
);
const fixtureClaims = { aggregateId: 'acct_test' };
class Instance extends Context.Service<Instance, { id: number }>()(
  'BackupSessionInstance',
) {}
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('live session backup ownership', () => {
  it('disposes its runtime even when session cleanup fails and can initialize again', async () => {
    let releases = 0;
    const session = makeSession({
      sharedWorker: () => {
        throw new Error(
          'Worker construction is not expected during declaration',
        );
      },
      kind: 'service',
      systemName: 'test',
      sessionName: 'cleanup-failure',
      serviceName: 'test',
      serviceVersion: '1.0.0',
      actorName: 'reader',
      actorVersion: '1.0.0',
      models: {},
      contracts: {},
      automations: {},
      claimsSchema: claims,
      layer: Layer.mergeAll(
        apiLayer,
        Layer.effect(
          Instance,
          Effect.acquireRelease(Effect.succeed({ id: 1 }), () =>
            Effect.sync(() => {
              releases++;
            }),
          ),
        ),
      ),
    });
    await session.initialize({ claims: fixtureClaims });
    const runtime = session.runtime;
    connections.failSessionCleanup = true;
    await expect(session.dispose()).rejects.toThrow('session-cleanup-failed');
    expect(releases).toBe(1);
    expect(session.store.getState().sessionStatus).toBe('released');
    expect(() => runtime.runSync(Instance)).toThrow('ManagedRuntime disposed');
    try {
      await session.initialize({ claims: fixtureClaims });
      expect(session.runtime).not.toBe(runtime);
    } finally {
      await session.dispose();
    }
    expect(releases).toBe(2);
  });

  it('keeps synchronized runtimes independent and allows duplicate node attachments without backup ownership', async () => {
    const opened = connections.opened;
    const closed = connections.closed;
    let acquired = 0;
    const layer = Layer.mergeAll(
      apiLayer,
      Layer.effect(
        Instance,
        Effect.sync(() => ({ id: ++acquired })),
      ),
    );
    const first = makeSession({
      sharedWorker: () => {
        throw new Error(
          'Worker construction is not expected during declaration',
        );
      },
      kind: 'aggregate',
      systemName: 'test',
      sessionName: 'aggregate',
      aggregateName: 'test',
      aggregateVersion: '1.0.0',
      actorName: 'writer',
      actorVersion: '1.0.0',
      models: {},
      contracts: {},
      automations: {},
      claimsSchema: claims,
      layer,
    });
    const second = makeSession({
      sharedWorker: () => {
        throw new Error(
          'Worker construction is not expected during declaration',
        );
      },
      kind: 'service',
      systemName: 'test',
      sessionName: 'service',
      serviceName: 'test',
      serviceVersion: '1.0.0',
      actorName: 'reader',
      actorVersion: '1.0.0',
      models: {},
      contracts: {},
      automations: {},
      claimsSchema: claims,
      layer,
    });
    const duplicate = makeSession({
      sharedWorker: () => {
        throw new Error(
          'Worker construction is not expected during declaration',
        );
      },
      kind: 'service',
      systemName: 'test',
      sessionName: 'service',
      serviceName: 'test',
      serviceVersion: '1.0.0',
      actorName: 'reader',
      actorVersion: '1.0.0',
      models: {},
      contracts: {},
      automations: {},
      claimsSchema: claims,
      layer,
    });
    expect(connections.opened).toBe(opened);
    try {
      await Promise.all([
        first.initialize({ claims: fixtureClaims }),
        second.initialize({ claims: fixtureClaims }),
      ]);
      expect(connections.opened).toBe(opened);
      expect(first.runtime.runSync(Instance)).not.toBe(
        second.runtime.runSync(Instance),
      );
      await duplicate.initialize({ claims: fixtureClaims });
      await first.dispose();
      expect(connections.closed).toBe(closed);
      expect(second.store.getState().isInitialized).toBe(true);
      await second.dispose();
      expect(connections.closed).toBe(closed);
      expect(duplicate.store.getState().isInitialized).toBe(true);
      expect(connections.opened).toBe(opened);
    } finally {
      await Promise.all([
        first.dispose(),
        second.dispose(),
        duplicate.dispose(),
      ]);
    }
    expect(connections.closed).toBe(closed);
  });

  it('preserves standalone backups across disposal and resets with a fresh runtime', async () => {
    const document = Object.assign(new EventTarget(), {
      visibilityState: 'visible',
    });
    const window = new EventTarget();
    vi.stubGlobal('document', document);
    vi.stubGlobal('addEventListener', window.addEventListener.bind(window));
    vi.stubGlobal(
      'removeEventListener',
      window.removeEventListener.bind(window),
    );
    let acquired = 0;
    let released = 0;
    const session = makeStandaloneSession({
      kind: 'aggregate',
      key: 'reset-test',
      sessionName: 'standalone',
      aggregateName: 'test',
      aggregateVersion: '1.0.0',
      actorName: 'writer',
      actorVersion: '1.0.0',
      models: {},
      contracts: {},
      claimsSchema: claims,
      claims: fixtureClaims,
      layer: Layer.effect(
        Instance,
        Effect.acquireRelease(
          Effect.sync(() => ({ id: ++acquired })),
          () =>
            Effect.sync(() => {
              released++;
            }),
        ),
      ),
    });
    const statuses: string[] = [];
    const unsubscribe = session.store.subscribe(state => {
      statuses.push(state.sessionStatus);
    });
    try {
      await session.initialize();
      const first = session.runtime;
      const saved = [...connections.snapshots.keys()];
      expect(saved).toHaveLength(1);
      await session.reset();
      expect(session.runtime).not.toBe(first);
      expect(session.runtime.runSync(Instance).id).toBe(2);
      expect(session.store.getState().sessionStatus).toBe('current');
      expect(released).toBe(1);
      await session.dispose();
      expect([...connections.snapshots.keys()]).toEqual(saved);
      connections.appliedParameters.length = 0;
      await session.initialize();
      expect(connections.appliedParameters).toContainEqual([
        session.sessionId,
        1,
      ]);
      expect(session.runtime.runSync(Instance).id).toBe(3);
      expect(session.store.getState().sessionStatus).toBe('current');
      const reset = session.reset();
      const disposed = session.dispose();
      await Promise.all([reset, disposed]);
      expect(session.store.getState().sessionStatus).toBe('released');
      expect(acquired).toBe(3);
    } finally {
      await session.dispose();
      unsubscribe();
    }
    expect(released).toBe(3);
    expect(statuses).not.toContain('failed');
  });
});
