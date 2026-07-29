import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  ServiceFrontendGenerationBoundaryBlockSchema,
  ServiceFrontendLineageBlockSchema,
  ServiceFrontendLineageTransitionRequiredSchema,
  ServiceFrontendReplicaBlockSchema,
  ServiceFrontendReplicaStateSchema,
} from './ServiceFrontendBlockSchema.ts';

describe('service frontend lineage and replica schemas', () => {
  it('decodes distinct state, lineage, replica, and transition contracts', () => {
    const serviceFrontendBlock = {
      serviceName: 'catalog',
      actorName: 'viewer',
      actorId: 'actr_service_schema',
      frontendName: 'products',
      frontendIndex: 4,
      lastServiceCursor: 'svcur_service_schema_4',
      delta: { inserted: [], updated: [], deleted: [] },
    };
    const lineageBlock = {
      kind: 'service-frontend',
      systemId: 'sys_service_schema',
      generationId: 'gen_service_schema',
      serviceName: 'catalog',
      actorId: 'actr_service_schema',
      actorName: 'viewer',
      frontendName: 'products',
      frontendBlock: serviceFrontendBlock,
    };
    const boundary = {
      kind: 'generation-boundary',
      systemId: 'sys_service_schema',
      prevGenerationId: 'gen_service_schema',
      generationId: 'gen_service_schema_next',
      serviceName: 'catalog',
      actorId: 'actr_service_schema',
      actorName: 'viewer',
      frontendName: 'products',
      frontendIndex: 5,
    };
    const replicaState = {
      actorId: 'actr_service_schema',
      systemId: 'sys_service_schema',
      generationId: 'gen_service_schema',
      systemVersion: '2.0.0',
      systemWorkerName: 'service-schema-worker',
      serviceName: 'catalog',
      actorName: 'viewer',
      frontendName: 'products',
      frontendIndex: 4,
      resources: [],
      frontendVersion: '1.0.0',
      replicaIndex: 9,
    };
    const replicaBlock = {
      systemId: 'sys_service_schema',
      generationId: 'gen_service_schema',
      serviceName: 'catalog',
      actorId: 'actr_service_schema',
      actorName: 'viewer',
      frontendName: 'products',
      frontendVersion: '1.0.0',
      replicaIndex: 10,
      frontendIndex: 4,
      lineageBlock,
    };
    const transition = {
      kind: 'lineage-transition-required',
      systemId: 'sys_service_schema',
      generationId: 'gen_service_schema_next',
      serviceName: 'catalog',
      actorId: 'actr_service_schema',
      actorName: 'viewer',
      frontendName: 'products',
      frontendVersion: '2.0.0',
      appliedBoundaryIndex: 5,
      remainingBoundaries: [boundary],
    };

    expect(
      Schema.decodeUnknownSync(ServiceFrontendLineageBlockSchema)(
        lineageBlock,
      ),
    ).toEqual(lineageBlock);
    expect(
      Schema.decodeUnknownSync(ServiceFrontendGenerationBoundaryBlockSchema)(
        boundary,
      ),
    ).toEqual(boundary);
    expect(
      Schema.decodeUnknownSync(ServiceFrontendReplicaStateSchema)(replicaState),
    ).toEqual(replicaState);
    expect(
      Schema.decodeUnknownSync(ServiceFrontendReplicaBlockSchema)(replicaBlock),
    ).toEqual(replicaBlock);
    expect(
      Schema.decodeUnknownSync(
        ServiceFrontendLineageTransitionRequiredSchema,
      )(transition),
    ).toEqual(transition);
  });

  it('rejects an unbranded actor identity before replica application', () => {
    expect(() =>
      Schema.decodeUnknownSync(ServiceFrontendReplicaBlockSchema)({
        systemId: 'sys_service_schema',
        generationId: 'gen_service_schema',
        serviceName: 'catalog',
        actorId: 'not-an-actor-id',
        actorName: 'viewer',
        frontendName: 'products',
        frontendVersion: '1.0.0',
        replicaIndex: 10,
        frontendIndex: 4,
        lineageBlock: {
          kind: 'service-frontend',
          systemId: 'sys_service_schema',
          generationId: 'gen_service_schema',
          serviceName: 'catalog',
          actorId: 'not-an-actor-id',
          actorName: 'viewer',
          frontendName: 'products',
          frontendBlock: {
            serviceName: 'catalog',
            actorName: 'viewer',
            actorId: 'not-an-actor-id',
            frontendName: 'products',
            frontendIndex: 4,
            lastServiceCursor: 'svcur_service_schema_4',
            delta: { inserted: [], updated: [], deleted: [] },
          },
        },
      }),
    ).toThrow();
  });
});
