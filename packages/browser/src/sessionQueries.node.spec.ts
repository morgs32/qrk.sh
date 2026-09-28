import type { IBackupWorker } from '@zerospin/backup-worker';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { primitives } from '@zerospin/schema';
import { Layer, Redacted, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { makeMockAggregateSession } from './makeMockSession/makeMockAggregateSession';
import { makeMockServiceSession } from './makeMockSession/makeMockServiceSession';
import { makeSession } from './makeSession/makeSession';
import { makeStandaloneSession } from './makeStandaloneSession/makeStandaloneSession';

vi.mock('@zerospin/backup-worker', async () => {
  const { Effect } = await import('effect');
  const worker: IBackupWorker = {
    onDisconnect: () => () => {},
    acquireDb: () =>
      Effect.succeed({
        status: 'acquired',
        snapshot: null,
        db: {
          overwriteDb: () => Effect.void,
          applyStatements: () => Effect.void,
          exportSnapshot: () => Effect.succeed(null),
          dispose: () => Effect.void,
        },
      }),
  };
  return { acquireBackupWorker: () => Effect.succeed(worker) };
});

vi.mock('./connectBrowserNode.ts', () => ({
  connectBrowserNode: async (
    props: Parameters<
      typeof import('./connectBrowserNode').connectBrowserNode
    >[0],
  ) => ({
    ready: async () =>
      props.receive({
        identity: {
          ...props.request,
          targetId: 'acct_test',
          actorName: 'reader',
          actorVersion: '1.0.0',
          claims: { aggregateId: 'acct_test' },
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
      }),
    dispose: async () => {},
    resnapshot: async () => {},
  }),
  nodeResult: (result: { success: unknown }) => result.success,
}));
const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: {
      value: primitives.json({
        schema: Schema.Struct({ count: Schema.Number }),
      }),
    },
    indexes: [],
  },
);
const common = {
  sessionName: 'reader',
  actorName: 'reader',
  actorVersion: '1.0.0',
  models: { item },
  claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
};
const aggregate = {
  ...common,
  aggregateName: 'test',
  aggregateVersion: '1.0.0',
  contracts: {},
};
const service = { ...common, serviceName: 'test', serviceVersion: '1.0.0' };
const layer = Layer.mergeAll(
  Layer.succeed(ZerospinApiUrl, 'http://test'),
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
);
const sharedWorker = () => {
  throw new Error('Mock connection does not construct a worker');
};

describe('session database queries', () => {
  it.each(['aggregate', 'service', 'mock aggregate', 'mock service'])(
    'publishes and releases %s db',
    async kind => {
      const session =
        kind === 'aggregate'
          ? makeSession({
              ...aggregate,
              kind: 'aggregate',
              systemName: 'test',
              layer,
              sharedWorker,
            })
          : kind === 'service'
            ? makeSession({
                ...service,
                kind: 'service',
                systemName: 'test',
                layer,
                sharedWorker,
              })
            : kind === 'mock aggregate'
              ? makeMockAggregateSession({
                  definition: { ...aggregate, kind: 'aggregate' },
                  claims: { aggregateId: 'acct_test' },
                })
              : makeMockServiceSession({
                  definition: makeServiceSessionDefinition(service),
                  claims: { aggregateId: 'acct_test' },
                });
      expect(session.store.getState().db).toBeNull();
      try {
        await session.initialize({ claims: { aggregateId: 'acct_test' } });
        const state = session.store.getState();
        if (!state.isInitialized) throw new Error('Session did not initialize');
        expect(Object.keys(state.db.query)).toContain('item');
        state.db
          .insert(state.schema.item)
          .values({
            id: 'itm_one',
            modelName: 'item',
            version: '1.0.0',
            createdAt: new Date(),
            updatedAt: new Date(),
            value: '{"count":1}',
          })
          .run();
        expect(state.db.query.item.findFirst().sync()?.value).toEqual({
          count: 1,
        });
        expect(state.db.select().from(state.schema.item).get()?.value).toBe(
          '{"count":1}',
        );
        const changed: string[] = [];
        const unsubscribe = state.db.$client.subscribeToTableChanges(tables =>
          changed.push(...tables),
        );
        try {
          state.db
            .update(state.schema.item)
            .set({ value: '{"count":2}' })
            .run();
          state.db.$client.flushTableChanges();
          expect(changed).toContain('item');
          expect(state.db.query.item.findFirst().sync()?.value).toEqual({
            count: 2,
          });
          state.db.update(state.schema.item).set({ value: '{broken' }).run();
          state.db.$client.flushTableChanges();
          expect(() => state.db.query.item.findFirst().sync()).toThrow();
        } finally {
          unsubscribe();
        }
      } finally {
        await session.dispose();
      }
      expect(session.store.getState()).toMatchObject({
        db: null,
      });
    },
  );
});

it('publishes decoded queries through the standalone session database', async () => {
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
  });
  const window = new EventTarget();
  vi.stubGlobal('document', document);
  vi.stubGlobal('addEventListener', window.addEventListener.bind(window));
  vi.stubGlobal('removeEventListener', window.removeEventListener.bind(window));
  const session = makeStandaloneSession({
    ...aggregate,
    kind: 'aggregate',
    key: 'decoded-standalone-query',
    claims: { aggregateId: 'acct_test' },
    layer,
  });
  try {
    await session.initialize();
    const state = session.store.getState();
    if (!state.isInitialized) {
      throw new Error('Standalone session did not initialize');
    }
    state.db
      .insert(state.schema.item)
      .values({
        id: 'itm_one',
        modelName: 'item',
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        value: '{"count":1}',
      })
      .run();
    expect(state.db.query.item.findFirst().sync()?.value).toEqual({ count: 1 });
    expect(state.db.select().from(state.schema.item).get()?.value).toBe(
      '{"count":1}',
    );
  } finally {
    await session.dispose();
    vi.unstubAllGlobals();
  }
});
