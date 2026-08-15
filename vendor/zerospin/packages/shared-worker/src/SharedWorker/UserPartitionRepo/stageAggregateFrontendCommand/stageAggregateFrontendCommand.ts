import type { ISystemId } from '@zerospin/core/system/types';
import { ZerospinError } from '@zerospin/error';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';

import type { UserPartitionRepo as IUserPartitionRepo } from '../../../acquireUserPartitionRepo.ts';
import { type makeIdbSQLite3 } from '../../../drizzle/makeIdbSQLite3.ts';
import type { IAsyncWaSqliteDrizzleDb } from '../../../drizzle/types.ts';
import { type AggregateFrontendReplicaRepo } from '../../AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts';
import {
  aggregateFrontendReplicas,
  type userReplicaDbConfig,
} from '../../userReplicaSchemas.ts';

export const stageAggregateFrontendCommand = Effect.fn(
  'UserPartitionRepo.stageAggregateFrontendCommand',
)((props: {
  request: Parameters<IUserPartitionRepo['stageAggregateFrontendCommand']>[0];
  userReplicaStores: Map<
    string,
    {
      userId: string;
      userReplicaSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
      db: IAsyncWaSqliteDrizzleDb<typeof userReplicaDbConfig>;
      systemId: string;
      vfsName: string;
      acquisitionTail: Promise<void>;
    }
  >;
  systemId: ISystemId;
  userId: string;
  aggregateReplicaRuntimes: Map<string, AggregateFrontendReplicaRepo>;
  ownerToken: object;
}) => {
  const {
    request,
    userReplicaStores,
    systemId,
    userId,
    aggregateReplicaRuntimes,
    ownerToken,
  } = props;
  return Effect.tryPromise({
    try: async () => {
      const userReplicaStore = userReplicaStores.get(`${systemId}/${userId}`);
      if (userReplicaStore === undefined) {
        throw new ZerospinError({
          code: 'shared-worker-user-replica-store-missing',
          message: 'SharedWorker user replica store was not initialized',
        });
      }
      const row = await userReplicaStore.db
        .select()
        .from(aggregateFrontendReplicas)
        .where(
          and(
            eq(
              aggregateFrontendReplicas.aggregateId,
              request.target.aggregateId,
            ),
            eq(
              aggregateFrontendReplicas.aggregateName,
              request.target.aggregateName,
            ),
            eq(aggregateFrontendReplicas.userId, userId),
            eq(
              aggregateFrontendReplicas.frontendName,
              request.target.frontendName,
            ),
            eq(
              aggregateFrontendReplicas.aggregateFrontendLockKey,
              request.target.aggregateFrontendLockKey,
            ),
          ),
        )
        .get();
      if (row === undefined) {
        throw new ZerospinError({
          code: 'aggregate-frontend-replica-not-acquired',
          message:
            'No ready exact-lock aggregate frontend replica matches the stage target',
        });
      }
      const replicaRuntime = aggregateReplicaRuntimes.get(
        `${systemId}/${userId}/aggregate/${row.id}`,
      );
      if (replicaRuntime === undefined) {
        throw new ZerospinError({
          code: 'aggregate-frontend-replica-runtime-missing',
          message: 'Aggregate frontend replica must be acquired before staging',
        });
      }
      return replicaRuntime.stage({
        ownerToken,
        sessionIndex: request.sessionIndex,
        command: request.command,
        mutations: request.mutations,
      });
    },
    catch: cause =>
      ZerospinError.isZerospinError(cause)
        ? cause
        : new ZerospinError({
            code: 'stage-aggregate-frontend-command-in-worker-failed',
            message: 'Failed to durably stage frontend command in SharedWorker',
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
  });
});
