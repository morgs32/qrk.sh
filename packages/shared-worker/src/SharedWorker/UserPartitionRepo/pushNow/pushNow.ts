import type { ISystemId } from '@zerospin/core/system/types';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { UserPartitionRepo as IUserPartitionRepo } from '../../../acquireUserPartitionRepo.ts';
import type { AggregateFrontendReplicaRepo } from '../../AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts';

export const pushNow = Effect.fn('UserPartitionRepo.pushNow')(
  (props: {
    request: Parameters<IUserPartitionRepo['pushNow']>[0];
    systemId: ISystemId;
    userId: string;
    aggregateReplicaRuntimes: Map<string, AggregateFrontendReplicaRepo>;
  }) =>
    Effect.tryPromise({
      try: async () => {
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
              props.request.aggregateFrontendLockKey &&
            candidate.runtimeStatus !== 'failed',
        );
        if (replicaRuntime === undefined) {
          throw new ZerospinError({
            code: 'aggregate-frontend-replica-runtime-missing',
            message: 'The exact aggregate replica must be acquired first',
          });
        }
        const result = await replicaRuntime.pushJournalCommands({
          manual: true,
        });
        if (result === undefined) {
          throw new ZerospinError({
            code: 'aggregate-frontend-push-result-missing',
            message: 'The exact aggregate push produced no result',
          });
        }
        return result;
      },
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'push-aggregate-frontend-commands-now-failed',
              message: 'Failed to push the paused exact aggregate replica',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    }),
);
