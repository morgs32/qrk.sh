import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  ServiceFrontendSnapshotSchema,
  ServiceSelectedCommandSchema,
} from './ServiceSelectedCommandSchema.ts';

const resource = {
  id: 'prd_selected',
  modelName: 'product',
  name: 'Selected',
  version: '1.0.0',
  createdAt: '2026-08-31T12:00:00.000Z',
  updatedAt: '2026-08-31T12:00:00.000Z',
};

const selectedCommand = {
  id: 'cmd_service_frontend',
  serviceIndex: 4,
  delta: {
    upserted: [resource],
    deleted: [{ id: 'prd_deleted', modelName: 'product' }],
  },
  serviceHash: 'a'.repeat(64),
};

describe('service frontend command schemas', () => {
  it('decodes the minimal selected command and rejects source command fields', async () => {
    expect(
      await Effect.runPromise(
        Schema.decodeUnknownEffect(ServiceSelectedCommandSchema)(
          selectedCommand,
          { onExcessProperty: 'error' },
        ),
      ),
    ).toMatchObject({
      id: selectedCommand.id,
      delta: { upserted: [expect.objectContaining({ id: resource.id })] },
      serviceHash: selectedCommand.serviceHash,
    });

    for (const leakedField of [
      { payload: '{}' },
      { failure: null },
      { mutations: [] },
      { serviceVersion: '1.0.0' },
    ]) {
      await expect(
        Effect.runPromise(
          Schema.decodeUnknownEffect(ServiceSelectedCommandSchema)(
            { ...selectedCommand, ...leakedField },
            { onExcessProperty: 'error' },
          ),
        ),
      ).rejects.toThrow();
    }
  });

  it('decodes the complete snapshot without system identity', async () => {
    const snapshot = {
      authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
      serviceName: 'catalog',
      frontendName: 'products',
      serviceIndex: 4,
      serviceHash: 'b'.repeat(64),
      serviceVersion: '1.0.0',
      resources: [resource],
    };
    expect(
      await Effect.runPromise(
        Schema.decodeUnknownEffect(ServiceFrontendSnapshotSchema)(snapshot),
      ),
    ).toMatchObject({
      serviceIndex: snapshot.serviceIndex,
      serviceHash: snapshot.serviceHash,
      resources: [expect.objectContaining({ id: resource.id })],
    });
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(ServiceFrontendSnapshotSchema)(
          { ...snapshot, systemId: 'sys_1' },
          { onExcessProperty: 'error' },
        ),
      ),
    ).rejects.toThrow();
  });
});
