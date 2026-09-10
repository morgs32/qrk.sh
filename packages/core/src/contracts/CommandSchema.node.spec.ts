import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  AggregateChainedCommandSchema,
  AggregateExecutionEntrySchema,
  ServiceChainedCommandSchema,
  UnknownAggregateCommandSchema,
  UnknownServiceCommandSchema,
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
  serviceVersion: '2.0.0',
};

const aggregateCommand = {
  id: 'cmd_aggregate',
  commandName: 'createCart',
  payload: '{}',
  contractVersion: '1.0.0',
  aggregateId: 'acct_test',
  aggregateName: 'cart',
  aggregateVersion: '2.0.0',
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

const dispositionHash =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('singular command schemas', () => {
  it('accepts aggregate and service seeds without a commandType discriminator', async () => {
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(UnknownServiceCommandSchema)({
          ...serviceCommand,
          payload: {},
        }),
      ),
    ).resolves.toMatchObject({ serviceName: 'catalog' });
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(UnknownAggregateCommandSchema)({
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
        dispositionHash: null,
        failedAt: null,
        failure: null,
      }),
    );
    const successful = await Effect.runPromise(
      Schema.decodeUnknownEffect(ServiceChainedCommandSchema)({
        ...common,
        dispositionHash,
        delta: resourceDelta,
        failedAt: null,
        failure: null,
      }),
    );
    const failed = await Effect.runPromise(
      Schema.decodeUnknownEffect(ServiceChainedCommandSchema)({
        ...common,
        dispositionHash,
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
          dispositionHash,
          delta: emptyDelta,
          failedAt: '2026-08-31T12:00:01.000Z',
          failure: 'rejected',
        }),
      ),
    ).rejects.toThrow();
  });

  it('accepts pending and terminal aggregate occurrences', async () => {
    const pending = {
      aggregateIndex: 1,
      chainedAt: '2026-08-31T12:00:00.000Z',
      delta: null,
      failedAt: null,
      failure: null,
      dispositionHash: null,
    };
    const terminal = {
      aggregateIndex: 1,
      chainedAt: '2026-08-31T12:00:00.000Z',
      delta: null,
      failedAt: null,
      failure: null,
      dispositionHash,
    };
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(AggregateChainedCommandSchema)(
          {
            ...aggregateCommand,
            ...pending,
          },
          { onExcessProperty: 'error' },
        ),
      ),
    ).resolves.toMatchObject({ aggregateIndex: 1, dispositionHash: null });
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(AggregateChainedCommandSchema)(
          {
            ...aggregateCommand,
            ...terminal,
          },
          { onExcessProperty: 'error' },
        ),
      ),
    ).resolves.toMatchObject({ aggregateIndex: 1, dispositionHash });
  });

  it('requires a lowercase SHA-256 dispositionHash on successful and failed aggregate occurrences', async () => {
    const common = {
      ...aggregateCommand,
      aggregateIndex: 1,
      chainedAt: '2026-08-31T12:00:00.000Z',
    };
    const failed = await Effect.runPromise(
      Schema.decodeUnknownEffect(AggregateChainedCommandSchema)({
        ...common,
        delta: null,
        failedAt: '2026-08-31T12:00:01.000Z',
        failure: encodedFailure,
        dispositionHash,
      }),
    );
    expect(failed.dispositionHash).toBe(dispositionHash);

    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(AggregateChainedCommandSchema)(
          {
            ...common,
            delta: null,
            failedAt: null,
            failure: null,
            dispositionHash: 'NOT-A-HASH',
          },
          { onExcessProperty: 'error' },
        ),
      ),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(AggregateChainedCommandSchema)(
          {
            ...common,
            delta: emptyDelta,
            failedAt: null,
            failure: null,
            dispositionHash,
          },
          { onExcessProperty: 'error' },
        ),
      ),
    ).rejects.toThrow();
  });

  it('accepts dispositionHash on terminal service-chain occurrences', async () => {
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
            dispositionHash,
          },
          { onExcessProperty: 'error' },
        ),
      ),
    ).resolves.toMatchObject({ dispositionHash });
  });

  it('decodes a shared aggregate execution entry with mutations', async () => {
    const command = {
      ...aggregateCommand,
      aggregateIndex: 1,
      chainedAt: '2026-08-31T12:00:00.000Z',
      delta: null,
      failedAt: null,
      failure: null,
      dispositionHash: null,
    };
    const direct = await Effect.runPromise(
      Schema.decodeUnknownEffect(AggregateExecutionEntrySchema)({
        sourceCommand: JSON.stringify(aggregateCommand),
        preparationVersion: '1.0.0',
        executionTimestamp: '2026-08-31T12:00:00.000Z',
        command,
        mutations: [
          {
            modelName: 'product',
            modelVersion: '1.0.0',
            commandId: 'cmd_aggregate',
            mutationIndex: 0,
            operationName: 'replicate',
            resourceId: 'prd_test',
            operation: JSON.stringify({
              serviceName: 'catalog',
              serviceVersion: '1.0.0',
              serviceIndex: 42,
              resource: { id: 'prd_test' },
            }),
          },
        ],
      }),
    );
    expect(direct.mutations).toHaveLength(1);
    expect(JSON.parse(direct.mutations[0]!.operation)).toMatchObject({
      serviceName: 'catalog',
      serviceVersion: '1.0.0',
      serviceIndex: 42,
    });
    expect(direct.mutations[0]?.resourceId).toBe('prd_test');
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
            dispositionHash,
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
