import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  AggregateChainedCommandSchema,
  SeedCommandSchema,
  ServiceChainedCommandSchema,
} from './CommandSchema.ts';

const emptyDelta = {
  inserted: [],
  updated: [],
  deleted: [],
  mutations: [],
};

const resourceDelta = {
  inserted: [
    {
      id: 'prd_test',
      modelName: 'product',
      name: 'Product',
      version: '1.0.0',
      createdAt: '2026-08-31T12:00:00.000Z',
      updatedAt: '2026-08-31T12:00:00.000Z',
    },
  ],
  updated: [],
  deleted: [],
  mutations: [],
};

const serviceCommand = {
  id: 'cmd_service',
  commandName: 'createProduct',
  payload: '{}',
  contractVersion: '1.0.0',
  serviceName: 'catalog',
};

const aggregateCommand = {
  id: 'cmd_aggregate',
  commandName: 'createCart',
  payload: '{}',
  contractVersion: '1.0.0',
  aggregateId: 'acct_test',
  aggregateName: 'cart',
  systemName: 'shopping',
  sessionId: null,
  userId: null,
  frontendName: null,
  pushIndex: null,
};

const encodedFailure = {
  cause: null,
  code: 'rejected',
  extra: null,
  message: 'rejected',
  status: null,
};

describe('singular command schemas', () => {
  it('accepts aggregate and service seeds without a commandType discriminator', async () => {
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(SeedCommandSchema)({
          ...serviceCommand,
          payload: {},
        }),
      ),
    ).resolves.toMatchObject({ serviceName: 'catalog' });
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(SeedCommandSchema)({
          ...aggregateCommand,
          payload: {},
        }),
      ),
    ).resolves.toMatchObject({ aggregateName: 'cart' });
  });

  it('decodes pending, successful, and failed service occurrences', async () => {
    const common = {
      ...serviceCommand,
      serviceIndex: 1,
      chainedAt: '2026-08-31T12:00:00.000Z',
    };
    const pending = await Effect.runPromise(
      Schema.decodeUnknownEffect(ServiceChainedCommandSchema)({
        ...common,
        delta: null,
        failedAt: null,
        failure: null,
      }),
    );
    const successful = await Effect.runPromise(
      Schema.decodeUnknownEffect(ServiceChainedCommandSchema)({
        ...common,
        delta: resourceDelta,
        failedAt: null,
        failure: null,
      }),
    );
    const failed = await Effect.runPromise(
      Schema.decodeUnknownEffect(ServiceChainedCommandSchema)({
        ...common,
        delta: emptyDelta,
        failedAt: '2026-08-31T12:00:01.000Z',
        failure: encodedFailure,
      }),
    );

    expect(pending.delta).toBeNull();
    expect(successful.delta?.inserted).toEqual([
      expect.objectContaining({ id: 'prd_test', name: 'Product' }),
    ]);
    expect(failed.failedAt).toEqual(new Date('2026-08-31T12:00:01.000Z'));
    expect(failed.failure).toEqual(encodedFailure);
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(ServiceChainedCommandSchema)({
          ...common,
          delta: emptyDelta,
          failedAt: '2026-08-31T12:00:01.000Z',
          failure: 'rejected',
        }),
      ),
    ).rejects.toThrow();
  });

  it('accepts direct and service-derived aggregate occurrences', async () => {
    const terminal = {
      aggregateIndex: 1,
      chainedAt: '2026-08-31T12:00:00.000Z',
      delta: emptyDelta,
      failedAt: null,
      failure: null,
    };
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(AggregateChainedCommandSchema)({
          ...aggregateCommand,
          ...terminal,
        }, { onExcessProperty: 'error' }),
      ),
    ).resolves.toMatchObject({ aggregateIndex: 1 });
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(AggregateChainedCommandSchema)({
          ...serviceCommand,
          ...terminal,
          serviceIndex: 4,
        }),
      ),
    ).resolves.toMatchObject({ aggregateIndex: 1, serviceIndex: 4 });
  });

  it('rejects serviceIndex on a direct aggregate occurrence', async () => {
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(AggregateChainedCommandSchema)(
          {
            ...aggregateCommand,
            aggregateIndex: 1,
            serviceIndex: null,
            chainedAt: '2026-08-31T12:00:00.000Z',
            delta: emptyDelta,
            failedAt: null,
            failure: null,
          },
          { onExcessProperty: 'error' },
        ),
      ),
    ).rejects.toThrow();
  });

  it('requires an empty delta for failure', async () => {
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(ServiceChainedCommandSchema)({
          ...serviceCommand,
          serviceIndex: 1,
          chainedAt: '2026-08-31T12:00:00.000Z',
          delta: {
            ...emptyDelta,
            inserted: [
              {
                id: 'prd_test',
                modelName: 'product',
                version: '1.0.0',
                createdAt: '2026-08-31T12:00:00.000Z',
                updatedAt: '2026-08-31T12:00:00.000Z',
              },
            ],
          },
          failedAt: '2026-08-31T12:00:01.000Z',
          failure: encodedFailure,
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects legacy lifecycle, cursor, generic-index, and block-envelope fields', async () => {
    for (const legacy of [
      { status: 'executed' },
      { mode: 'authoritative' },
      { commandType: 'service' },
      { cursor: 'cursor_legacy' },
      { chainIndex: 1 },
      { blockIndex: 1 },
      { commands: [] },
      { executedAt: '2026-08-31T12:00:00.000Z' },
      { stagedAt: '2026-08-31T12:00:00.000Z' },
      { pushedAt: '2026-08-31T12:00:00.000Z' },
    ]) {
      await expect(
        Effect.runPromise(
          Schema.decodeUnknownEffect(ServiceChainedCommandSchema)(
            {
              ...serviceCommand,
              serviceIndex: 1,
              chainedAt: '2026-08-31T12:00:00.000Z',
              delta: emptyDelta,
              failedAt: null,
              failure: null,
              ...legacy,
            },
            { onExcessProperty: 'error' },
          ),
        ),
      ).rejects.toThrow();
    }
  });
});
