import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type { IServiceFrontendController } from '../frontendController/types.ts';

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
  userId: IServiceFrontendReplicaState['userId'];
  systemId: IServiceFrontendReplicaState['systemId'];
  serviceFrontendLockKey: string;
  db: IDb<IResourceDbConfig<FRONTEND['models'], Record<never, never>>>;
  models: FRONTEND['models'];
  frontendReplicaState: IServiceFrontendReplicaState;
}): Effect.fn.Return<void, IAnyError> {
  const {
    userId,
    db,
    frontend,
    frontendReplicaState,
    models,
    systemId,
    serviceFrontendLockKey,
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
    frontendReplicaState.userId !== userId ||
    frontendReplicaState.systemId !== systemId ||
    frontendReplicaState.serviceName !== frontend.serviceName ||
    frontendReplicaState.frontendName !== frontend.frontendName ||
    frontendReplicaState.serviceFrontendLockKey !== serviceFrontendLockKey
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-replica-state-target-mismatch',
      message: 'Service frontend replica state does not match the bound target',
      extra: {
        expectedUserId: userId,
        expectedSystemId: systemId,
        expectedServiceName: frontend.serviceName,
        expectedFrontendName: frontend.frontendName,
        expectedServiceFrontendLockKey: serviceFrontendLockKey,
        actualUserId: frontendReplicaState.userId,
        actualSystemId: frontendReplicaState.systemId,
        actualServiceName: frontendReplicaState.serviceName,
        actualFrontendName: frontendReplicaState.frontendName,
        actualServiceFrontendLockKey:
          frontendReplicaState.serviceFrontendLockKey,
      },
    });
  }

  yield* applyServiceFrontendState({
    frontend,
    userId,
    systemId,
    db,
    models,
    frontendState: {
      userId: frontendReplicaState.userId,
      systemId: frontendReplicaState.systemId,
      systemVersion: frontendReplicaState.systemVersion,
      serviceName: frontendReplicaState.serviceName,
      frontendName: frontendReplicaState.frontendName,
      frontendIndex: frontendReplicaState.frontendIndex,
      resources: frontendReplicaState.resources,
    },
  });
});
