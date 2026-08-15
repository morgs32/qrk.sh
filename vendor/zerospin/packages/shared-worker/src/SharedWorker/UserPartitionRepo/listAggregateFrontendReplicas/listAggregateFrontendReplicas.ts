import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { ISystemId } from '@zerospin/core/system/types';
import { ZerospinError } from '@zerospin/error';
import { isNotNull } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { type makeIdbSQLite3 } from '../../../drizzle/makeIdbSQLite3.ts';
import type { IAsyncWaSqliteDrizzleDb } from '../../../drizzle/types.ts';
import { type AggregateFrontendReplicaRepo } from '../../AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts';
import {
  aggregateFrontendReplicas,
  aggregateFrontendSpecSchema,
  type userReplicaDbConfig,
} from '../../userReplicaSchemas.ts';

export const listAggregateFrontendReplicas = Effect.fn(
  'UserPartitionRepo.listAggregateFrontendReplicas',
)((props: {
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
}) => {
  const { userReplicaStores, systemId, userId, aggregateReplicaRuntimes } =
    props;
  return Effect.tryPromise({
    try: async () => {
      const userReplicaStore = userReplicaStores.get(`${systemId}/${userId}`);
      if (userReplicaStore === undefined) {
        throw new ZerospinError({
          code: 'shared-worker-user-replica-store-missing',
          message: 'SharedWorker user replica store was not initialized',
        });
      }
      const rows = await userReplicaStore.db
        .select()
        .from(aggregateFrontendReplicas)
        .where(isNotNull(aggregateFrontendReplicas.aggregateFrontendLock))
        .orderBy(aggregateFrontendReplicas.frontendName)
        .all();
      return rows.map(row => {
        const replicaRuntime = aggregateReplicaRuntimes.get(
          `${systemId}/${userId}/aggregate/${row.id}`,
        );
        const metadata = replicaRuntime?.catalogRow;
        const status: 'activating' | 'ready' | 'repairing' | 'failed' =
          replicaRuntime?.runtimeStatus ?? 'activating';
        return {
          aggregateId: row.aggregateId,
          aggregateName: row.aggregateName,
          userId: row.userId,
          frontendName: row.frontendName,
          aggregateFrontendLockKey: row.aggregateFrontendLockKey,
          frontendSpec: Schema.decodeUnknownSync(
            Schema.parseJson(aggregateFrontendSpecSchema),
          )(row.frontendSpec, { onExcessProperty: 'error' }),
          aggregateFrontendLock: Schema.decodeUnknownSync(
            Schema.parseJson(AggregateFrontendLockSchema),
          )(row.aggregateFrontendLock, { onExcessProperty: 'error' }),
          databaseName: `${row.id}/${row.databaseName}`,
          status,
          frontendIndex: metadata?.frontendIndex ?? 0,
          replicaIndex: metadata?.replicaIndex ?? 0,
          systemVersion: metadata?.systemVersion ?? '',
          activeRegistrationCount:
            replicaRuntime?.activeRegistrationCount() ?? 0,
          socketState: replicaRuntime?.runtimeSocketState ?? 'disconnected',
          reconnectAttempt: replicaRuntime?.runtimeReconnectAttempt ?? 0,
          pushInFlight: replicaRuntime?.pushInFlight ?? false,
          lastFailure:
            replicaRuntime?.runtimeLastFailure === null ||
            replicaRuntime === undefined
              ? null
              : Schema.encodeUnknownSync(ZerospinError.schema)(
                  ZerospinError.parse(replicaRuntime.runtimeLastFailure),
                ),
        };
      });
    },
    catch: cause =>
      ZerospinError.isZerospinError(cause)
        ? cause
        : new ZerospinError({
            code: 'list-aggregate-frontend-replicas-failed',
            message: 'Failed to list aggregate frontend replicas',
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
  });
});
