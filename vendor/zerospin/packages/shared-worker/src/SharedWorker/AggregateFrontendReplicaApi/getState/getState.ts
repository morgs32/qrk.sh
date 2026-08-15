import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { AggregateFrontendReplicaRepo } from '../../AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts';

export const getState = Effect.fn('AggregateFrontendReplicaApi.getState')(
  (props: {
    registrationId: string;
    replicaRuntime: AggregateFrontendReplicaRepo;
  }) =>
    Effect.tryPromise({
      try: () => props.replicaRuntime.getAcquiredState(props.registrationId),
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'read-aggregate-frontend-replica-failed',
              message: 'Failed to read aggregate frontend replica',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    }).pipe(encodeRpc),
);
