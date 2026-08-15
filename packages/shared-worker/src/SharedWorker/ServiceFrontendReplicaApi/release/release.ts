import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { ServiceFrontendReplicaRepo } from '../../ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts';

export const release = Effect.fn('ServiceFrontendReplicaApi.release')(
  (props: {
    registrationId: string;
    replicaRuntime: ServiceFrontendReplicaRepo;
  }) =>
    Effect.tryPromise({
      try: () => props.replicaRuntime.release(props.registrationId),
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'release-service-frontend-replica-failed',
              message: 'Failed to release service frontend replica',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    }).pipe(encodeRpc),
);
