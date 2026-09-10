import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  ServiceFrontendFinalizedCommandSchema,
  ServiceFrontendStateSchema,
} from './ServiceFrontendCommandSchema.ts';

const emptyDelta = {
  inserted: [],
  updated: [],
  deleted: [],
  mutations: [],
};

const frontendDelta = {
  inserted: [
    {
      id: 'prd_inserted',
      modelName: 'product',
      name: 'Inserted',
      version: '1.0.0',
      createdAt: '2026-08-31T12:00:00.000Z',
      updatedAt: '2026-08-31T12:00:00.000Z',
    },
  ],
  updated: [
    {
      id: 'prd_updated',
      modelName: 'product',
      name: 'Updated',
      version: '1.0.0',
      createdAt: '2026-08-31T11:00:00.000Z',
      updatedAt: '2026-08-31T12:00:00.000Z',
    },
  ],
  deleted: [{ id: 'prd_deleted', modelName: 'product' }],
  mutations: [],
};

const serviceCommand = {
  id: 'cmd_service_frontend',
  commandName: 'updateProduct',
  payload: '{}',
  contractVersion: '1.0.0',
  serviceName: 'catalog',
  dispositionHash: 'a'.repeat(64),
  serviceIndex: 4,
  serviceVersion: '1.0.0',
  chainedAt: '2026-08-31T12:00:00.000Z',
};

const encodedFailure = {
  cause: null,
  code: 'rejected',
  extra: null,
  message: 'rejected',
  status: null,
};

describe('service frontend command schemas', () => {
  it('rejects pending and decodes successful and failed finalized occurrences', async () => {
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(ServiceFrontendFinalizedCommandSchema)({
          ...serviceCommand,
          delta: null,
          failedAt: null,
          failure: null,
        }),
      ),
    ).rejects.toThrow();
    const successful = await Effect.runPromise(
      Schema.decodeUnknownEffect(ServiceFrontendFinalizedCommandSchema)({
        ...serviceCommand,
        delta: frontendDelta,
        failedAt: null,
        failure: null,
      }),
    );
    const failedInput = {
      ...serviceCommand,
      delta: emptyDelta,
      failedAt: '2026-08-31T12:00:01.000Z',
      failure: encodedFailure,
    };
    const failed = await Effect.runPromise(
      Schema.decodeUnknownEffect(ServiceFrontendFinalizedCommandSchema)(
        failedInput,
      ),
    );
    expect(successful.delta).toMatchObject({
      inserted: [expect.objectContaining({ id: 'prd_inserted' })],
      updated: [expect.objectContaining({ id: 'prd_updated' })],
      deleted: [{ id: 'prd_deleted', modelName: 'product' }],
    });
    expect(failed.failure).toEqual(encodedFailure);
  });

  it('decodes complete finalized state frontiers', async () => {
    const state = {
      userId: 'usr_1',
      systemId: 'sys_1',
      serviceName: 'catalog',
      frontendName: 'products',
      serviceIndex: 4,
      serviceVersion: '1.0.0',
      resources: frontendDelta.inserted,
    };
    const finalizedState = await Effect.runPromise(
      Schema.decodeUnknownEffect(ServiceFrontendStateSchema)(state),
    );
    expect(finalizedState).toMatchObject({
      serviceIndex: 4,
      serviceVersion: '1.0.0',
      resources: [expect.objectContaining({ id: 'prd_inserted' })],
    });
  });
});
