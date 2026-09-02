import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  AggregateFrontendFinalizedCommandSchema,
  AggregateFrontendPushedCommandSchema,
  AggregateFrontendSyncStateSchema,
  SessionCommandSchema,
} from './AggregateFrontendCommandSchema.ts';

const emptyDelta = {
  inserted: [],
  updated: [],
  deleted: [],
  mutations: [],
};

const frontendDelta = {
  inserted: [
    {
      id: 'lst_inserted',
      modelName: 'list',
      name: 'Inserted',
      version: '1.0.0',
      createdAt: '2026-08-31T12:00:00.000Z',
      updatedAt: '2026-08-31T12:00:00.000Z',
    },
  ],
  updated: [
    {
      id: 'lst_updated',
      modelName: 'list',
      name: 'Updated',
      version: '1.0.0',
      createdAt: '2026-08-31T11:00:00.000Z',
      updatedAt: '2026-08-31T12:00:00.000Z',
    },
  ],
  deleted: [{ id: 'lst_deleted', modelName: 'list' }],
  mutations: [],
};

const sessionCommand = {
  id: 'cmd_session',
  commandName: 'createList',
  payload: '{}',
  contractVersion: '1.0.0',
  aggregateId: 'acct_1',
  aggregateName: 'user',
  systemName: 'shopping',
  sessionId: 'sesn_1',
  userId: 'usr_1',
  frontendName: 'main',
};

const serviceCommand = {
  id: 'cmd_service',
  commandName: 'updateProduct',
  payload: '{}',
  contractVersion: '1.0.0',
  serviceName: 'catalog',
};

const encodedFailure = {
  cause: null,
  code: 'rejected',
  extra: null,
  message: 'rejected',
  status: null,
};

describe('aggregate frontend command schemas', () => {
  it('decodes pending, successful, and failed pushed occurrences with complete provenance', async () => {
    const common = {
      ...sessionCommand,
      pushIndex: 2,
      chainedAt: '2026-08-31T12:00:00.000Z',
    };
    const pending = await Effect.runPromise(
      Schema.decodeUnknownEffect(AggregateFrontendPushedCommandSchema)({
        ...common,
        delta: null,
        failedAt: null,
        failure: null,
      }),
    );
    const successful = await Effect.runPromise(
      Schema.decodeUnknownEffect(AggregateFrontendPushedCommandSchema)({
        ...common,
        delta: frontendDelta,
        failedAt: null,
        failure: null,
      }),
    );
    const failed = await Effect.runPromise(
      Schema.decodeUnknownEffect(AggregateFrontendPushedCommandSchema)({
        ...common,
        delta: emptyDelta,
        failedAt: '2026-08-31T12:00:01.000Z',
        failure: encodedFailure,
      }),
    );

    expect(pending.delta).toBeNull();
    expect(successful).toMatchObject({
      sessionId: 'sesn_1',
      userId: 'usr_1',
      frontendName: 'main',
      pushIndex: 2,
      delta: {
        inserted: [expect.objectContaining({ id: 'lst_inserted' })],
        updated: [expect.objectContaining({ id: 'lst_updated' })],
        deleted: [{ id: 'lst_deleted', modelName: 'list' }],
      },
    });
    expect(failed.failure).toEqual(encodedFailure);
  });

  it('decodes complete direct and service-derived finalized occurrences', async () => {
    const pending = await Effect.runPromise(
      Schema.decodeUnknownEffect(AggregateFrontendFinalizedCommandSchema)(
        {
          ...sessionCommand,
          pushIndex: 2,
          aggregateIndex: 3,
          frontendIndex: 2,
          chainedAt: '2026-08-31T12:00:00.000Z',
          delta: null,
          failedAt: null,
          failure: null,
        },
        { onExcessProperty: 'error' },
      ),
    );
    const direct = await Effect.runPromise(
      Schema.decodeUnknownEffect(AggregateFrontendFinalizedCommandSchema)(
        {
          ...sessionCommand,
          pushIndex: 2,
          aggregateIndex: 3,
          frontendIndex: 2,
          chainedAt: '2026-08-31T12:00:00.000Z',
          delta: frontendDelta,
          failedAt: null,
          failure: null,
        },
        { onExcessProperty: 'error' },
      ),
    );
    const derived = await Effect.runPromise(
      Schema.decodeUnknownEffect(AggregateFrontendFinalizedCommandSchema)({
        ...serviceCommand,
        serviceIndex: 4,
        aggregateIndex: 5,
        frontendIndex: 3,
        chainedAt: '2026-08-31T12:00:01.000Z',
        delta: emptyDelta,
        failedAt: null,
        failure: null,
      }),
    );
    const failedDerived = await Effect.runPromise(
      Schema.decodeUnknownEffect(AggregateFrontendFinalizedCommandSchema)({
        ...serviceCommand,
        serviceIndex: 5,
        aggregateIndex: 6,
        frontendIndex: 4,
        chainedAt: '2026-08-31T12:00:02.000Z',
        delta: emptyDelta,
        failedAt: '2026-08-31T12:00:03.000Z',
        failure: encodedFailure,
      }),
    );

    expect(pending.delta).toBeNull();
    expect(direct).toMatchObject({
      aggregateIndex: 3,
      frontendIndex: 2,
      pushIndex: 2,
      sessionId: 'sesn_1',
    });
    expect('serviceIndex' in direct).toBe(false);
    expect(derived).toMatchObject({
      serviceName: 'catalog',
      serviceIndex: 4,
      aggregateIndex: 5,
      frontendIndex: 3,
    });
    expect(failedDerived.failure).toEqual(encodedFailure);
  });

  it('decodes pending, successful, and failed local session occurrences', async () => {
    const common = {
      ...sessionCommand,
      pushIndex: null,
      sessionIndex: 1,
      chainedAt: '2026-08-31T12:00:00.000Z',
    };
    const pending = await Effect.runPromise(
      Schema.decodeUnknownEffect(SessionCommandSchema)({
        ...common,
        delta: null,
        failedAt: null,
        failure: null,
      }),
    );
    const successful = await Effect.runPromise(
      Schema.decodeUnknownEffect(SessionCommandSchema)({
        ...common,
        delta: frontendDelta,
        failedAt: null,
        failure: null,
      }),
    );
    const failedInput = {
      ...common,
      delta: emptyDelta,
      failedAt: '2026-08-31T12:00:01.000Z',
      failure: encodedFailure,
    };
    const failed = await Effect.runPromise(
      Schema.decodeUnknownEffect(SessionCommandSchema)(failedInput),
    );
    expect(pending.delta).toBeNull();
    expect(successful.delta?.inserted[0]).toMatchObject({ id: 'lst_inserted' });
    expect(failed.failure).toEqual(encodedFailure);
  });

  it('decodes complete sync state frontiers', async () => {
    const state = {
      aggregateId: 'acct_1',
      userId: 'usr_1',
      systemId: 'sys_1',
      systemVersion: '1.0.0',
      aggregateName: 'user',
      frontendName: 'main',
      aggregateIndex: 5,
      frontendIndex: 3,
      pushIndex: 2,
      resolvedPushIndexes: [1, 2],
      resources: frontendDelta.inserted,
    };
    const syncState = await Effect.runPromise(
      Schema.decodeUnknownEffect(AggregateFrontendSyncStateSchema)(state),
    );

    expect(syncState).toMatchObject({
      aggregateIndex: 5,
      frontendIndex: 3,
      pushIndex: 2,
      resolvedPushIndexes: [1, 2],
    });
  });
});
