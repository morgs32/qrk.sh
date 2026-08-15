import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { ISystemId } from '@zerospin/core/system/types';
import { ZerospinError } from '@zerospin/error';
import { isNotNull } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { type makeIdbSQLite3 } from '../../../drizzle/makeIdbSQLite3.ts';
import type { IAsyncWaSqliteDrizzleDb } from '../../../drizzle/types.ts';
import { type ServiceFrontendReplicaRepo } from '../../ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts';
import {
  serviceFrontendReplicas,
  serviceFrontendSpecSchema,
  type userReplicaDbConfig,
} from '../../userReplicaSchemas.ts';

export const listServiceFrontendReplicas = Effect.fn(
  'UserPartitionRepo.listServiceFrontendReplicas',
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
  serviceReplicaRuntimes: Map<string, ServiceFrontendReplicaRepo>;
}) => {
  const { userReplicaStores, systemId, userId, serviceReplicaRuntimes } = props;
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
        .from(serviceFrontendReplicas)
        .where(isNotNull(serviceFrontendReplicas.serviceFrontendLock))
        .orderBy(serviceFrontendReplicas.frontendName)
        .all();
      return rows.map(row => {
        const replicaRuntime = serviceReplicaRuntimes.get(
          `${systemId}/${userId}/service/${row.id}`,
        );
        const metadata = replicaRuntime?.catalogRow;
        const runtimeState = replicaRuntime?.getRuntimeState();
        const status: 'activating' | 'ready' | 'failed' =
          runtimeState?.status ?? 'activating';
        return {
          serviceName: row.serviceName,
          userId: row.userId,
          frontendName: row.frontendName,
          serviceFrontendLockKey: row.serviceFrontendLockKey,
          frontendSpec: Schema.decodeUnknownSync(
            Schema.parseJson(serviceFrontendSpecSchema),
          )(row.frontendSpec, { onExcessProperty: 'error' }),
          serviceFrontendLock: Schema.decodeUnknownSync(
            Schema.parseJson(ServiceFrontendLockSchema),
          )(row.serviceFrontendLock, { onExcessProperty: 'error' }),
          databaseName: `${row.id}/${row.databaseName}`,
          status,
          frontendIndex: metadata?.frontendIndex ?? 0,
          replicaIndex: metadata?.replicaIndex ?? 0,
          systemVersion: metadata?.systemVersion ?? '',
          activeRegistrationCount:
            replicaRuntime?.activeRegistrationCount() ?? 0,
          socketState: runtimeState?.socketState ?? 'disconnected',
          reconnectAttempt: runtimeState?.reconnectAttempt ?? 0,
          lastFailure:
            runtimeState?.lastFailure === null || runtimeState === undefined
              ? null
              : Schema.encodeUnknownSync(ZerospinError.schema)(
                  ZerospinError.parse(runtimeState.lastFailure),
                ),
        };
      });
    },
    catch: cause =>
      ZerospinError.isZerospinError(cause)
        ? cause
        : new ZerospinError({
            code: 'list-service-frontend-replicas-failed',
            message: 'Failed to list service frontend replicas',
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
  });
});
