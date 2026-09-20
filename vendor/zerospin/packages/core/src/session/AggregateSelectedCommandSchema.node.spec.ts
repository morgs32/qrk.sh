import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  AggregateFrontendSnapshotSchema,
  AggregateSelectedCommandSchema,
  SessionCommandSchema,
} from './AggregateSelectedCommandSchema.ts';

const resource = {
  id: 'lst_selected',
  modelName: 'list',
  name: 'Selected',
  version: '1.0.0',
  createdAt: '2026-08-31T12:00:00.000Z',
  updatedAt: '2026-08-31T12:00:00.000Z',
};

const selectedCommand = {
  id: 'cmd_selected',
  selectionIndex: 6,
  aggregateIndex: 3,
  delta: {
    upserted: [resource],
    deleted: [{ id: 'lst_deleted', modelName: 'list' }],
  },
  failure: null,
  selectionHash:
    'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
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
  authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
  frontendName: 'main',
  pushIndex: null,
  sessionIndex: 1,
  chainedAt: '2026-08-31T12:00:00.000Z',
};

describe('aggregate frontend command schemas', () => {
  it('decodes the minimal selected-command occurrence and rejects execution fields', async () => {
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(AggregateSelectedCommandSchema)(
          { ...selectedCommand, resolution: null },
          { onExcessProperty: 'error' },
        ),
      ),
    ).rejects.toThrow();

    for (const leakedField of [
      { payload: '{}' },
      { authentication: { userId: 'usr_1' } },
      { preparationVersion: '1.0.0' },
      { executionTimestamp: '2026-08-31T12:00:00.000Z' },
    ]) {
      await expect(
        Effect.runPromise(
          Schema.decodeUnknownEffect(AggregateSelectedCommandSchema)(
            { ...selectedCommand, ...leakedField },
            { onExcessProperty: 'error' },
          ),
        ),
      ).rejects.toThrow();
    }

    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(AggregateSelectedCommandSchema)({
          ...selectedCommand,
          delta: { inserted: [resource], updated: [], deleted: [], mutations: [] },
        }),
      ),
    ).rejects.toThrow();

    const decoded = await Effect.runPromise(
      Schema.decodeUnknownEffect(AggregateSelectedCommandSchema)(
        selectedCommand,
        { onExcessProperty: 'error' },
      ),
    );
    expect(decoded).toMatchObject({
      id: selectedCommand.id,
      delta: { upserted: [expect.objectContaining({ id: resource.id })] },
      failure: null,
    });
  });

  it('keeps the complete optimistic delta on local session occurrences', async () => {
    const localDelta = {
      inserted: [resource],
      updated: [],
      deleted: [],
      mutations: [],
    };
    const successful = await Effect.runPromise(
      Schema.decodeUnknownEffect(SessionCommandSchema)({
        ...sessionCommand,
        delta: localDelta,
        failedAt: null,
        failure: null,
      }),
    );
    expect(successful.delta).toMatchObject({
      inserted: [expect.objectContaining({ id: resource.id })],
      updated: [],
      deleted: [],
      mutations: [],
    });
  });

  it('decodes the complete snapshot without server routing identity', async () => {
    const snapshot = {
      aggregateId: 'acct_1',
      authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
      aggregateName: 'user',
      frontendName: 'main',
      aggregateIndex: 5,
      selectionIndex: 8,
      selectionHash:
        'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
      aggregateVersion: '1.0.0',
      selectedCommands: [selectedCommand],
      resources: [resource],
    };

    expect(
      await Effect.runPromise(
        Schema.decodeUnknownEffect(AggregateFrontendSnapshotSchema)(snapshot),
      ),
    ).toMatchObject({
      aggregateId: snapshot.aggregateId,
      selectedCommands: [expect.objectContaining({ id: selectedCommand.id })],
      resources: [expect.objectContaining({ id: resource.id })],
    });
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(AggregateFrontendSnapshotSchema)(
          { ...snapshot, systemId: 'sys_1' },
          { onExcessProperty: 'error' },
        ),
      ),
    ).rejects.toThrow();
  });
});
