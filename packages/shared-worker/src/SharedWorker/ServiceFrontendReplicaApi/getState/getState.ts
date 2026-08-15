import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { ServiceFrontendReplicaRepo } from '../../ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts';

export const getState = Effect.fn('ServiceFrontendReplicaApi.getState')(
  (props: {
    registrationId: string;
    replicaRuntime: ServiceFrontendReplicaRepo;
  }) =>
    Effect.tryPromise({
      try: () => props.replicaRuntime.getAcquiredState(props.registrationId),
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'read-service-frontend-replica-failed',
              message: 'Failed to read service frontend replica',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    }).pipe(encodeRpc),
);
