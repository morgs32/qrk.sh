import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  ServiceFrontendBlockSchema,
  ServiceFrontendReplicaBlockSchema,
  ServiceFrontendReplicaStateSchema,
} from './ServiceFrontendBlockSchema.ts';

describe('service frontend block and replica schemas', () => {
  it('decodes ordinary generation-free block and replica contracts', () => {
    const serviceFrontendBlock = {
      serviceName: 'catalog',
      userId: 'user_service_schema',
      frontendName: 'products',
      frontendIndex: 4,
      lastServiceCursor: 'svcur_service_schema_4',
      delta: { inserted: [], updated: [], deleted: [] },
    };
    const replicaState = {
      userId: 'user_service_schema',
      systemId: 'sys_service_schema',
      systemVersion: '2.0.0',
      serviceName: 'catalog',
      frontendName: 'products',
      frontendIndex: 4,
      resources: [],
      serviceFrontendLockKey: 'service-lock-key',
      replicaIndex: 9,
    };
    const replicaBlock = {
      systemId: 'sys_service_schema',
      serviceName: 'catalog',
      userId: 'user_service_schema',
      frontendName: 'products',
      serviceFrontendLockKey: 'service-lock-key',
      replicaIndex: 10,
      frontendIndex: 4,
      frontendBlock: serviceFrontendBlock,
    };

    expect(
      Schema.decodeUnknownSync(ServiceFrontendBlockSchema)(
        serviceFrontendBlock,
      ),
    ).toEqual(serviceFrontendBlock);
    expect(
      Schema.decodeUnknownSync(ServiceFrontendReplicaStateSchema)(replicaState),
    ).toEqual(replicaState);
    expect(
      Schema.decodeUnknownSync(ServiceFrontendReplicaBlockSchema)(replicaBlock),
    ).toEqual(replicaBlock);
  });

  it('rejects an empty user identity before replica application', () => {
    expect(() =>
      Schema.decodeUnknownSync(ServiceFrontendReplicaBlockSchema)({
        systemId: 'sys_service_schema',
        serviceName: 'catalog',
        userId: '',
        frontendName: 'products',
        serviceFrontendLockKey: 'service-lock-key',
        replicaIndex: 10,
        frontendIndex: 4,
        frontendBlock: {
          serviceName: 'catalog',
          userId: '',
          frontendName: 'products',
          frontendIndex: 4,
          lastServiceCursor: 'svcur_service_schema_4',
          delta: { inserted: [], updated: [], deleted: [] },
        },
      }),
    ).toThrow();
  });
});
