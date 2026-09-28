import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { primitives } from '@zerospin/schema';
import { Layer, Redacted, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { makeLiveQuery } from '../../live-query/src/makeLiveQuery.ts';

import { makeMockAggregateSession } from './makeMockSession/makeMockAggregateSession';
import { makeMockServiceSession } from './makeMockSession/makeMockServiceSession';
import { makeSession } from './makeSession/makeSession';

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

describe('session query handles', () => {
  it.each(['aggregate', 'service', 'mock aggregate', 'mock service'])(
    'publishes and releases %s queryDb',
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
      expect(session.store.getState().queryDb).toBeNull();
      try {
        await session.initialize({ claims: { aggregateId: 'acct_test' } });
        const state = session.store.getState();
        if (!state.isInitialized) throw new Error('Session did not initialize');
        expect(state.queryDb.$client).toBe(state.db.$client);
        expect(Object.keys(state.queryDb.query)).toEqual(['item']);
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
        expect(state.queryDb.query.item.findFirst().sync()?.value).toEqual({
          count: 1,
        });
        expect(state.db.query.item.findFirst().sync()?.value).toBe(
          '{"count":1}',
        );
        const query = state.queryDb.query.item.findMany();
        const live = makeLiveQuery<(typeof query)['_']['result']>({
          client: state.queryDb.$client,
          query,
          tableNames: [],
        });
        const unsubscribe = live.subscribe();
        try {
          state.db
            .update(state.schema.item)
            .set({ value: '{"count":2}' })
            .run();
          state.db.$client.flushTableChanges();
          expect(live.store.getState().data[0]?.value).toEqual({ count: 2 });
          state.db.update(state.schema.item).set({ value: '{broken' }).run();
          state.db.$client.flushTableChanges();
          expect(live.store.getState().error).toBeInstanceOf(Error);
          expect(live.store.getState().data[0]?.value).toEqual({ count: 2 });
        } finally {
          unsubscribe();
        }
      } finally {
        await session.dispose();
      }
      expect(session.store.getState()).toMatchObject({
        db: null,
        queryDb: null,
      });
    },
  );
});
