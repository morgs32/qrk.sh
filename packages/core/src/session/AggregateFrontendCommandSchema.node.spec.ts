import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  AggregateFrontendFinalizedCommandSchema,
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

const encodedFailure = {
  cause: null,
  code: 'rejected',
  extra: null,
  message: 'rejected',
  status: null,
};

describe('aggregate frontend command schemas', () => {
  it('decodes per-command deltas with complete originating resolutions and empty progress', async () => {
    const resolution = {
      sourceCommand: JSON.stringify(sessionCommand),
      command: {
        ...sessionCommand,
        pushIndex: null,
        aggregateIndex: 3,
        chainedAt: '2026-08-31T12:00:00.000Z',
        delta: null,
        failedAt: null,
        failure: null,
        dispositionHash: 'a'.repeat(64),
      },
      mutations: [],
      preparationVersion: '1.0.0',
      executionTimestamp: '2026-08-31T12:00:00.000Z',
    };
    const output = await Effect.runPromise(
      Schema.decodeUnknownEffect(AggregateFrontendFinalizedCommandSchema)(
        {
          userIndex: 6,
          aggregateIndex: 3,
          delta: frontendDelta,
          resolution,
        },
        { onExcessProperty: 'error' },
      ),
    );
    expect(output.resolution?.sourceCommand).toBe(resolution.sourceCommand);
    expect(output.resolution?.command).toMatchObject({
      id: 'cmd_session',
      aggregateIndex: 3,
    });
    expect(
      await Effect.runPromise(
        Schema.decodeUnknownEffect(AggregateFrontendFinalizedCommandSchema)({
          userIndex: 7,
          aggregateIndex: 3,
          delta: emptyDelta,
          resolution: null,
        }),
      ),
    ).toEqual({
      userIndex: 7,
      aggregateIndex: 3,
      delta: emptyDelta,
      resolution: null,
    });
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
      aggregateName: 'user',
      frontendName: 'main',
      aggregateIndex: 5,
      userIndex: 8,
      aggregateVersion: '1.0.0',
      resolutions: [
        {
          sourceCommand: JSON.stringify(sessionCommand),
          command: {
            ...sessionCommand,
            pushIndex: null,
            aggregateIndex: 3,
            chainedAt: '2026-08-31T12:00:00.000Z',
            delta: null,
            failedAt: null,
            failure: null,
            dispositionHash: 'a'.repeat(64),
          },
          mutations: [],
          preparationVersion: '1.0.0',
          executionTimestamp: '2026-08-31T12:00:00.000Z',
        },
      ],
      resources: frontendDelta.inserted,
    };
    const syncState = await Effect.runPromise(
      Schema.decodeUnknownEffect(AggregateFrontendSyncStateSchema)(state),
    );

    expect(syncState).toMatchObject({
      aggregateIndex: 5,
      userIndex: 8,
      aggregateVersion: '1.0.0',
      resolutions: [{ command: { id: 'cmd_session' } }],
    });
  });
});
