import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { AggregateFrontendReplicaRepo } from '../../AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts';

export const release = Effect.fn('AggregateFrontendReplicaApi.release')(
  (props: {
    registrationId: string;
    replicaRuntime: AggregateFrontendReplicaRepo;
  }) =>
    Effect.tryPromise({
      try: () => props.replicaRuntime.release(props.registrationId),
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'release-aggregate-frontend-replica-failed',
              message: 'Failed to release aggregate frontend replica',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    }).pipe(encodeRpc),
);
