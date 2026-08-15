import type { Async } from '@zerospin/core/async/Async';
import { makeTableMigrationStatements } from '@zerospin/core/drizzle/makeTableMigrationSQL';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { makeServiceFrontendLockKey } from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
import { makeDrizzleSchemaFromEncodedTable } from '@zerospin/core/models/primitiveMaps';
import type { IAnyDrizzleSchemas } from '@zerospin/core/models/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import type { ISystemId } from '@zerospin/core/system/types';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import type { authenticate } from '@zerospin/frontend/authenticate';
import type { TelemetryCollector } from '@zerospin/logger';
import { and, eq, getTableName, sql } from 'drizzle-orm';
import { Effect, Schema, type ManagedRuntime } from 'effect';

import type { UserPartitionRepo as IUserPartitionRepo } from '../../../acquireUserPartitionRepo.ts';
import { makeAsyncWaSqliteDrizzle } from '../../../drizzle/makeAsyncWaSqliteDrizzle.ts';
import { makeIdbSQLite3 } from '../../../drizzle/makeIdbSQLite3.ts';
import { migrateDbAsync } from '../../../drizzle/migrateDbAsync.ts';
import type { IAsyncWaSqliteDrizzleDb } from '../../../drizzle/types.ts';
import { encodedShapeSchema } from '../../AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts';
import { ServiceFrontendReplicaApi } from '../../ServiceFrontendReplicaApi/ServiceFrontendReplicaApi.ts';
import {
  serviceFrontendReplicaMetadata,
  ServiceFrontendReplicaRepo,
  serviceReplicaDbConfig,
} from '../../ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts';
import {
  serviceFrontendReplicas,
  serviceFrontendSpecSchema,
  type userReplicaDbConfig,
} from '../../userReplicaSchemas.ts';

const replicaDatabaseName = 'replica.db';

export const acquireServiceFrontendReplica = Effect.fn(
  'UserPartitionRepo.acquireServiceFrontendReplica',
)((props: {
  request: Parameters<IUserPartitionRepo['acquireServiceFrontendReplica']>[0];
  runtime: ManagedRuntime.ManagedRuntime<
    CuidFactory | MonotonicFactory,
    IAnyError
  >;
  authenticationRuntime: ManagedRuntime.ManagedRuntime<
    Async | PublishableKey | TelemetryCollector | ZerospinApiUrl,
    IAnyError
  >;
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
  systemName: string;
  serviceReplicaRuntimes: Map<string, ServiceFrontendReplicaRepo>;
  sharedWorkerWasmUrl: string;
  ownerToken: object;
  sharedWorkerApiUrl: string;
  allocateRegistrationId: () => number;
  getAuthenticatedApi(props: {
    freshness: 'current' | 'refresh-if-current' | 'force';
    failedAuthenticatedApi:
      | Effect.Effect.Success<
          ReturnType<typeof authenticate>
        >['authenticatedApi']
      | null;
  }): Promise<Effect.Effect.Success<ReturnType<typeof authenticate>>>;
  getCurrentAuthenticatedApi():
    | Effect.Effect.Success<ReturnType<typeof authenticate>>['authenticatedApi']
    | null;
}) => {
  const {
    request,
    runtime,
    authenticationRuntime,
    userReplicaStores,
    systemId,
    userId,
    systemName,
    serviceReplicaRuntimes,
    sharedWorkerWasmUrl,
    ownerToken,
    sharedWorkerApiUrl,
    allocateRegistrationId,
    getAuthenticatedApi,
    getCurrentAuthenticatedApi,
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
      if (
        request.frontendSpec.kind !== 'service' ||
        request.frontendSpec.systemName !== systemName ||
        request.frontendSpec.serviceName !== request.serviceName ||
        request.frontendSpec.frontendName !== request.frontendName ||
        request.serviceFrontendLock.systemName !== systemName ||
        request.serviceFrontendLock.frontendName !== request.frontendName
      ) {
        throw new ZerospinError({
          code: 'service-frontend-replica-spec-target-mismatch',
          message: 'Service frontend spec does not match acquisition target',
        });
      }
      const frontendSpec = Schema.decodeUnknownSync(serviceFrontendSpecSchema)(
        request.frontendSpec,
        { onExcessProperty: 'error' },
      );
      const encodedLock = Schema.encodeUnknownSync(
        Schema.parseJson(ServiceFrontendLockSchema),
      )(request.serviceFrontendLock, { onExcessProperty: 'error' });
      const encodedSpecLock = Schema.encodeUnknownSync(
        Schema.parseJson(ServiceFrontendLockSchema),
      )(frontendSpec.serviceFrontendLock, {
        onExcessProperty: 'error',
      });
      if (encodedLock !== encodedSpecLock) {
        throw new ZerospinError({
          code: 'service-frontend-replica-spec-lock-mismatch',
          message:
            'Service frontend spec and acquisition lock have different bytes',
        });
      }
      const serviceFrontendLockKey = await runtime.runPromise(
        makeServiceFrontendLockKey(request.serviceFrontendLock),
      );
      if (request.serviceFrontendLockKey !== serviceFrontendLockKey) {
        throw new ZerospinError({
          code: 'service-frontend-lock-key-mismatch',
          message: 'Service frontend lock key does not match its lock',
        });
      }
      const encodedSpec = Schema.encodeUnknownSync(
        Schema.parseJson(serviceFrontendSpecSchema),
      )(frontendSpec, { onExcessProperty: 'error' });

      const resultPromise = userReplicaStore.acquisitionTail.then(async () => {
        let unownedReplicaSqlite: Awaited<
          ReturnType<typeof makeIdbSQLite3>
        > | null = null;
        let unpublishedReplicaRuntime: ServiceFrontendReplicaRepo | null = null;
        let unpublishedRegistrationId: string | null = null;
        try {
          let catalogRow = await userReplicaStore.db
            .select()
            .from(serviceFrontendReplicas)
            .where(
              and(
                eq(serviceFrontendReplicas.serviceName, request.serviceName),
                eq(serviceFrontendReplicas.userId, userId),
                eq(serviceFrontendReplicas.frontendName, request.frontendName),
                eq(
                  serviceFrontendReplicas.serviceFrontendLockKey,
                  serviceFrontendLockKey,
                ),
              ),
            )
            .get();

          if (request.mode === 'existing-only' && catalogRow === undefined) {
            throw new ZerospinError({
              code: 'cached-service-frontend-replica-unavailable',
              message:
                'No exact ready service frontend replica is available offline',
            });
          }
          if (catalogRow !== undefined) {
            const storedLock = Schema.decodeUnknownSync(
              Schema.parseJson(ServiceFrontendLockSchema),
            )(catalogRow.serviceFrontendLock, { onExcessProperty: 'error' });
            if (
              Schema.encodeUnknownSync(
                Schema.parseJson(ServiceFrontendLockSchema),
              )(storedLock, { onExcessProperty: 'error' }) !== encodedLock
            ) {
              throw new ZerospinError({
                code: 'service-frontend-replica-definition-mismatch',
                message:
                  'Persisted service frontend lock differs at the exact key',
              });
            }
            if (catalogRow.frontendSpec !== encodedSpec) {
              throw new ZerospinError({
                code: 'service-frontend-replica-spec-mismatch',
                message:
                  'Persisted service frontend spec differs at the exact key',
              });
            }
          }

          const catalogWasPersisted = catalogRow !== undefined;
          if (catalogRow === undefined) {
            const replicaId = await runtime.runPromise(
              makeIdFromAbbreviation({ abbreviation: 'sfrp' }),
            );
            catalogRow = {
              id: replicaId,
              serviceName: request.serviceName,
              userId,
              frontendName: request.frontendName,
              serviceFrontendLockKey,
              serviceFrontendLock: encodedLock,
              frontendSpec: encodedSpec,
              databaseName: replicaDatabaseName,
              createdAt: new Date(),
            };
          }

          const runtimeKey = `${systemId}/${userId}/service/${catalogRow.id}`;
          const existingReplicaRuntime = serviceReplicaRuntimes.get(runtimeKey);
          if (existingReplicaRuntime !== undefined) {
            const runtimeState = existingReplicaRuntime.getRuntimeState();
            if (runtimeState.status === 'failed') {
              throw runtimeState.lastFailure === null
                ? new ZerospinError({
                    code: 'service-frontend-replica-failed',
                    message: 'The exact service replica is terminally failed',
                  })
                : ZerospinError.parse(runtimeState.lastFailure);
            }
            if (
              request.mode === 'existing-only' &&
              runtimeState.status !== 'ready'
            ) {
              throw new ZerospinError({
                code: 'cached-service-frontend-replica-unavailable',
                message:
                  'No exact ready service frontend replica is available offline',
              });
            }
            const { registrationId, registrationWasExisting } =
              await existingReplicaRuntime.serialize(() =>
                existingReplicaRuntime.acquire({
                  sink: request.sink,
                  mode: request.mode,
                  ownerToken,
                  getAuthenticatedApi,
                  getCurrentAuthenticatedApi,
                }),
              );
            try {
              if (
                request.mode === 'online' &&
                existingReplicaRuntime.requiresOnlineReplacement()
              ) {
                await existingReplicaRuntime.repairFromRegistration();
              }
            } catch (cause) {
              if (!registrationWasExisting) {
                await existingReplicaRuntime.release(registrationId);
              }
              throw cause;
            }
            if (request.mode === 'online') {
              setTimeout(() => void existingReplicaRuntime.connectSocket(), 0);
            }
            return new ServiceFrontendReplicaApi({
              registrationId,
              replicaRuntime: existingReplicaRuntime,
              runtime,
            });
          }

          const resourceSchemas: IAnyDrizzleSchemas = {};
          for (const [modelName, modelSpec] of Object.entries(
            frontendSpec.models,
          )) {
            const decodedIndexes: Array<{
              name: string;
              columns: [string, ...string[]];
              unique?: boolean;
            }> = [];
            for (const indexSpec of modelSpec.indexes) {
              const [firstColumn, ...otherColumns] = indexSpec.columns;
              if (firstColumn === undefined) {
                throw new ZerospinError({
                  code: 'service-frontend-replica-index-empty',
                  message: `Frontend model "${modelName}" has an empty index`,
                });
              }
              decodedIndexes.push({
                name: indexSpec.name,
                columns: [firstColumn, ...otherColumns],
                ...(indexSpec.unique === undefined
                  ? {}
                  : { unique: indexSpec.unique }),
              });
            }
            resourceSchemas[modelName] = makeDrizzleSchemaFromEncodedTable({
              name: modelSpec.modelName,
              shape: Schema.decodeUnknownSync(encodedShapeSchema)(
                modelSpec.properties,
              ),
              indexes: decodedIndexes,
            });
          }
          const completeReplicaDbConfig = {
            schema: { ...resourceSchemas, ...serviceReplicaDbConfig.schema },
            relations: serviceReplicaDbConfig.relations,
          };
          let replicaSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
          try {
            replicaSqlite = await makeIdbSQLite3({
              databaseName: catalogRow.databaseName,
              vfsName: `${userReplicaStore.vfsName}/service/${catalogRow.id}`,
              wasmUrl: sharedWorkerWasmUrl,
              mode:
                request.mode === 'online' ? 'create-or-open' : 'existing-only',
            });
          } catch (cause) {
            if (ZerospinError.isZerospinError(cause)) throw cause;
            if (request.mode === 'existing-only') {
              throw new ZerospinError({
                code: 'cached-service-frontend-replica-unavailable',
                message:
                  'No exact ready service frontend replica is available offline',
                cause: ZerospinError.prettyUnknownFailure(cause),
              });
            }
            throw cause;
          }
          unownedReplicaSqlite = replicaSqlite;
          const db = makeAsyncWaSqliteDrizzle(
            replicaSqlite,
            completeReplicaDbConfig,
          );
          const existingReplicaObjects = await db.all<{
            type: 'table' | 'index';
            name: string;
            sql: string | null;
          }>(
            sql`SELECT type, name, sql FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%'`,
          );
          const isEmptyReplicaDatabase =
            existingReplicaObjects.filter(object => object.type === 'table')
              .length === 0;
          if (catalogWasPersisted && isEmptyReplicaDatabase) {
            throw new ZerospinError({
              code: 'browser-persistence-reset-required',
              message:
                'The persisted service locator points to an empty exact database',
            });
          }
          if (request.mode === 'existing-only' && isEmptyReplicaDatabase) {
            throw new ZerospinError({
              code: 'cached-service-frontend-replica-unavailable',
              message:
                'No exact ready service frontend replica is available offline',
            });
          }
          if (!isEmptyReplicaDatabase) {
            const expectedObjects = new Map<
              string,
              Readonly<{ type: 'table' | 'index'; sql: string }>
            >();
            for (const drizzleSchema of Object.values(
              completeReplicaDbConfig.schema,
            )) {
              const tableName = getTableName(drizzleSchema);
              const statements = makeTableMigrationStatements(drizzleSchema);
              const tableStatement = statements[0];
              if (tableStatement === undefined) {
                throw new ZerospinError({
                  code: 'browser-persistence-reset-required',
                  message:
                    'The service exact database schema cannot be verified',
                });
              }
              expectedObjects.set(tableName, {
                type: 'table',
                sql: tableStatement,
              });
              for (const statement of statements.slice(1)) {
                const match = /CREATE (?:UNIQUE )?INDEX ([^ ]+) ON /u.exec(
                  statement,
                );
                const indexName = match?.[1];
                if (indexName === undefined) {
                  throw new ZerospinError({
                    code: 'browser-persistence-reset-required',
                    message:
                      'The service exact database index schema cannot be verified',
                  });
                }
                expectedObjects.set(indexName, {
                  type: 'index',
                  sql: statement,
                });
              }
            }
            const normalizeSql = (definition: string) =>
              definition.replace(/;\s*$/u, '').replace(/\s+/gu, ' ').trim();
            if (
              existingReplicaObjects.length !== expectedObjects.size ||
              existingReplicaObjects.some(object => {
                const expected = expectedObjects.get(object.name);
                return (
                  expected === undefined ||
                  expected.type !== object.type ||
                  object.sql === null ||
                  normalizeSql(expected.sql) !== normalizeSql(object.sql)
                );
              })
            ) {
              throw new ZerospinError({
                code: 'browser-persistence-reset-required',
                message:
                  'The service exact database does not match the current persistence baseline',
              });
            }
          }
          if (request.mode === 'online') {
            await runtime.runPromise(
              migrateDbAsync({ db, schema: completeReplicaDbConfig.schema }),
            );
          }
          const metadataRows = await db
            .select()
            .from(serviceFrontendReplicaMetadata)
            .all();
          if (
            metadataRows.length > 1 ||
            (metadataRows.length === 1 && metadataRows[0]?.id !== catalogRow.id)
          ) {
            throw new ZerospinError({
              code: 'browser-persistence-reset-required',
              message:
                'The service exact database metadata does not own this locator',
            });
          }
          const metadataRow = metadataRows[0];
          if (metadataRow === undefined) {
            let hasPersistedContent = false;
            for (const resourceSchema of Object.values(resourceSchemas)) {
              if (
                (await db.select().from(resourceSchema).limit(1).get()) !==
                undefined
              ) {
                hasPersistedContent = true;
                break;
              }
            }
            if (hasPersistedContent) {
              throw new ZerospinError({
                code: 'browser-persistence-reset-required',
                message:
                  'The service exact database has resources without its metadata row',
              });
            }
            if (catalogWasPersisted || !isEmptyReplicaDatabase) {
              throw new ZerospinError({
                code: 'browser-persistence-reset-required',
                message:
                  'The service exact database is missing its required metadata',
              });
            }
            if (request.mode === 'existing-only') {
              throw new ZerospinError({
                code: 'cached-service-frontend-replica-unavailable',
                message:
                  'No exact ready service frontend replica is available offline',
              });
            }
          }
          if (
            metadataRow !== undefined &&
            (!Number.isSafeInteger(metadataRow.frontendIndex) ||
              metadataRow.frontendIndex < 0 ||
              !Number.isSafeInteger(metadataRow.replicaIndex) ||
              metadataRow.replicaIndex < 0)
          ) {
            throw new ZerospinError({
              code: 'browser-persistence-reset-required',
              message:
                'The service exact database metadata is missing or corrupt',
            });
          }

          const replicaRow =
            metadataRow === undefined
              ? catalogRow
              : { ...catalogRow, ...metadataRow };
          const replicaRuntime = new ServiceFrontendReplicaRepo(
            replicaRow,
            userReplicaStore,
            replicaSqlite,
            db,
            resourceSchemas,
            frontendSpec,
            runtime,
            authenticationRuntime,
            systemId,
            systemName,
            sharedWorkerApiUrl,
            allocateRegistrationId,
            false,
          );
          unpublishedReplicaRuntime = replicaRuntime;
          const { registrationId } = await replicaRuntime.serialize(() =>
            replicaRuntime.acquire({
              sink: request.sink,
              mode: request.mode,
              ownerToken,
              getAuthenticatedApi,
              getCurrentAuthenticatedApi,
            }),
          );
          unpublishedRegistrationId = registrationId;
          if (request.mode === 'online') {
            await replicaRuntime.repairFromRegistration();
          } else {
            await replicaRuntime.getSnapshot();
          }
          if (!catalogWasPersisted) {
            await userReplicaStore.db
              .insert(serviceFrontendReplicas)
              .values(catalogRow)
              .run();
          }
          serviceReplicaRuntimes.set(runtimeKey, replicaRuntime);
          unownedReplicaSqlite = null;
          unpublishedReplicaRuntime = null;
          unpublishedRegistrationId = null;
          if (request.mode === 'online') {
            setTimeout(() => void replicaRuntime.connectSocket(), 0);
          }
          return new ServiceFrontendReplicaApi({
            registrationId,
            replicaRuntime,
            runtime,
          });
        } catch (cause) {
          if (
            unpublishedReplicaRuntime !== null &&
            unpublishedRegistrationId !== null
          ) {
            await unpublishedReplicaRuntime.release(unpublishedRegistrationId);
          }
          if (unownedReplicaSqlite !== null) {
            await unownedReplicaSqlite.sqlite3
              .close(unownedReplicaSqlite.db)
              .catch(() => undefined);
            await unownedReplicaSqlite.vfs.close().catch(() => undefined);
          }
          throw cause;
        }
      });
      userReplicaStore.acquisitionTail = resultPromise.then(
        () => undefined,
        () => undefined,
      );
      return resultPromise;
    },
    catch: cause =>
      ZerospinError.isZerospinError(cause)
        ? cause
        : new ZerospinError({
            code: 'acquire-service-frontend-replica-failed',
            message: 'Failed to acquire service frontend replica',
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
  });
});
