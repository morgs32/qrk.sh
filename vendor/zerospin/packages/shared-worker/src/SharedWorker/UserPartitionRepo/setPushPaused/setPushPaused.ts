import type { ISystemId } from '@zerospin/core/system/types';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { UserPartitionRepo as IUserPartitionRepo } from '../../../acquireUserPartitionRepo.ts';
import type { AggregateFrontendReplicaRepo } from '../../AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts';

export const setPushPaused = Effect.fn('UserPartitionRepo.setPushPaused')(
  (props: {
    request: Parameters<IUserPartitionRepo['setPushPaused']>[0];
    systemId: ISystemId;
    userId: string;
    aggregateReplicaRuntimes: Map<string, AggregateFrontendReplicaRepo>;
  }) =>
    Effect.try({
      try: () => {
        const replicaRuntime = [
          ...props.aggregateReplicaRuntimes.values(),
        ].find(
          candidate =>
            candidate.systemId === props.systemId &&
            candidate.catalogRow.userId === props.userId &&
            candidate.catalogRow.aggregateName ===
              props.request.aggregateName &&
            candidate.catalogRow.aggregateId === props.request.aggregateId &&
            candidate.catalogRow.frontendName === props.request.frontendName &&
            candidate.catalogRow.aggregateFrontendLockKey ===
              props.request.aggregateFrontendLockKey,
        );
        if (replicaRuntime === undefined) {
          throw new ZerospinError({
            code: 'aggregate-frontend-replica-runtime-missing',
            message: 'The exact aggregate replica must be acquired first',
          });
        }
        replicaRuntime.setPushPaused(props.request.pushPaused);
      },
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'set-aggregate-frontend-push-paused-failed',
              message: 'Failed to change exact aggregate push state',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    }),
);
