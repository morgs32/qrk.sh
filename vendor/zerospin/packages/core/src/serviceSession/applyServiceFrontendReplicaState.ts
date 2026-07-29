import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type { IServiceFrontendController } from '../serviceFrontendController/types.ts';

import { applyServiceFrontendState } from './applyServiceFrontendState.ts';
import { ServiceFrontendReplicaStateSchema } from './ServiceFrontendBlockSchema.ts';
import type { IServiceFrontendReplicaState } from './types.ts';

/*
 * 1. Validate the complete worker-replica wire shape and bound target.
 * 2. Pass an explicit server-state shape to the base replacement transaction.
 * 3. Keep replica-only metadata outside the Provider resource database.
 */
export const applyServiceFrontendReplicaState = Effect.fn(
  'applyServiceFrontendReplicaState',
)(function* <FRONTEND extends IServiceFrontendController>(props: {
  frontend: FRONTEND;
  actorId: IServiceFrontendReplicaState['actorId'];
  systemId: IServiceFrontendReplicaState['systemId'];
  generationId: string;
  systemVersion: string;
  systemWorkerName: string;
  db: IDb<IResourceDbConfig<FRONTEND['models'], Record<never, never>>>;
  models: FRONTEND['models'];
  frontendReplicaState: IServiceFrontendReplicaState;
}): Effect.fn.Return<void, IAnyError> {
  const {
    actorId,
    db,
    frontend,
    frontendReplicaState,
    generationId,
    models,
    systemId,
    systemVersion,
    systemWorkerName,
  } = props;

  yield* Schema.encode(ServiceFrontendReplicaStateSchema)(
    frontendReplicaState,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'service-frontend-replica-state-encode-failed',
      prefix: 'Failed to encode service frontend replica state',
    }),
  );

  if (
    frontendReplicaState.frontendVersion !== frontend.version ||
    frontendReplicaState.actorId !== actorId ||
    frontendReplicaState.systemId !== systemId ||
    frontendReplicaState.generationId !== generationId ||
    frontendReplicaState.systemWorkerName !== systemWorkerName ||
    frontendReplicaState.serviceName !== frontend.serviceName ||
    frontendReplicaState.actorName !== frontend.actorName ||
    frontendReplicaState.frontendName !== frontend.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-replica-state-target-mismatch',
      message: 'Service frontend replica state does not match the bound target',
      extra: {
        expectedFrontendVersion: frontend.version,
        expectedActorId: actorId,
        expectedSystemId: systemId,
        expectedGenerationId: generationId,
        expectedSystemWorkerName: systemWorkerName,
        expectedServiceName: frontend.serviceName,
        expectedActorName: frontend.actorName,
        expectedFrontendName: frontend.frontendName,
        actualFrontendVersion: frontendReplicaState.frontendVersion,
        actualActorId: frontendReplicaState.actorId,
        actualSystemId: frontendReplicaState.systemId,
        actualGenerationId: frontendReplicaState.generationId,
        actualSystemWorkerName: frontendReplicaState.systemWorkerName,
        actualServiceName: frontendReplicaState.serviceName,
        actualActorName: frontendReplicaState.actorName,
        actualFrontendName: frontendReplicaState.frontendName,
        authenticatedSystemVersion: systemVersion,
        replicaSystemVersion: frontendReplicaState.systemVersion,
      },
    });
  }

  yield* applyServiceFrontendState({
    frontend,
    actorId,
    systemId,
    generationId,
    systemVersion: frontendReplicaState.systemVersion,
    systemWorkerName,
    db,
    models,
    frontendState: {
      actorId: frontendReplicaState.actorId,
      systemId: frontendReplicaState.systemId,
      generationId: frontendReplicaState.generationId,
      systemVersion: frontendReplicaState.systemVersion,
      systemWorkerName: frontendReplicaState.systemWorkerName,
      serviceName: frontendReplicaState.serviceName,
      actorName: frontendReplicaState.actorName,
      frontendName: frontendReplicaState.frontendName,
      frontendIndex: frontendReplicaState.frontendIndex,
      resources: frontendReplicaState.resources,
    },
  });
});
