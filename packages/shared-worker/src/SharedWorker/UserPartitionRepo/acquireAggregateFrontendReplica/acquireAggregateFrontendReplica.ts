import type { Async } from '@zerospin/core/async/Async';
import { makeTableMigrationStatements } from '@zerospin/core/drizzle/makeTableMigrationSQL';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
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
import { AggregateFrontendReplicaApi } from '../../AggregateFrontendReplicaApi/AggregateFrontendReplicaApi.ts';
import {
  aggregateFrontendCommandJournal,
  aggregateFrontendReplicaDbConfig,
  aggregateFrontendReplicaMetadata,
  AggregateFrontendReplicaRepo,
  encodedShapeSchema,
} from '../../AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts';
import {
  aggregateFrontendReplicas,
  aggregateFrontendSpecSchema,
  type userReplicaDbConfig,
} from '../../userReplicaSchemas.ts';

const replicaDatabaseName = 'replica.db';

export const acquireAggregateFrontendReplica = Effect.fn(
  'UserPartitionRepo.acquireAggregateFrontendReplica',
)((props: {
  request: Parameters<IUserPartitionRepo['acquireAggregateFrontendReplica']>[0];
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
  systemName: string;
  userId: string;
  aggregateReplicaRuntimes: Map<string, AggregateFrontendReplicaRepo>;
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
    systemName,
    userId,
    aggregateReplicaRuntimes,
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
        request.frontendSpec.kind !== 'aggregate' ||
        request.frontendSpec.aggregateName !== request.aggregateName ||
        request.frontendSpec.frontendName !== request.frontendName
      ) {
        throw new ZerospinError({
          code: 'aggregate-frontend-replica-spec-target-mismatch',
          message: 'Aggregate frontend spec does not match acquisition target',
        });
      }
      const encodedLock = Schema.encodeUnknownSync(
        Schema.parseJson(AggregateFrontendLockSchema),
      )(request.aggregateFrontendLock, { onExcessProperty: 'error' });
      const encodedSpecLock = Schema.encodeUnknownSync(
        Schema.parseJson(AggregateFrontendLockSchema),
      )(request.frontendSpec.aggregateFrontendLock, {
        onExcessProperty: 'error',
      });
      if (encodedLock !== encodedSpecLock) {
        throw new ZerospinError({
          code: 'aggregate-frontend-replica-spec-lock-mismatch',
          message:
            'Aggregate frontend spec and acquisition lock have different bytes',
        });
      }
      const aggregateFrontendLockKey = await runtime.runPromise(
        makeAggregateFrontendLockKey(request.aggregateFrontendLock),
      );
      if (request.aggregateFrontendLockKey !== aggregateFrontendLockKey) {
        throw new ZerospinError({
          code: 'aggregate-frontend-lock-key-mismatch',
          message: 'Aggregate frontend lock key does not match its lock',
        });
      }
      const encodedSpec = Schema.encodeUnknownSync(
        Schema.parseJson(aggregateFrontendSpecSchema),
      )(request.frontendSpec, { onExcessProperty: 'error' });

      const resultPromise = userReplicaStore.acquisitionTail.then(async () => {
        let unownedReplicaSqlite: Awaited<
          ReturnType<typeof makeIdbSQLite3>
        > | null = null;
        let registeredRuntime: AggregateFrontendReplicaRepo | null = null;
        let registeredId: string | null = null;
        let registeredWasExisting = false;
        try {
          let catalogRow = await userReplicaStore.db
            .select()
            .from(aggregateFrontendReplicas)
            .where(
              and(
                eq(aggregateFrontendReplicas.aggregateId, request.aggregateId),
                eq(
                  aggregateFrontendReplicas.aggregateName,
                  request.aggregateName,
                ),
                eq(aggregateFrontendReplicas.userId, userId),
                eq(
                  aggregateFrontendReplicas.frontendName,
                  request.frontendName,
                ),
                eq(
                  aggregateFrontendReplicas.aggregateFrontendLockKey,
                  aggregateFrontendLockKey,
                ),
              ),
            )
            .get();

          if (request.mode === 'existing-only' && catalogRow === undefined) {
            throw new ZerospinError({
              code: 'cached-aggregate-frontend-replica-unavailable',
              message:
                'No exact ready aggregate frontend replica is available offline',
            });
          }
          if (catalogRow !== undefined) {
            const storedLock = Schema.decodeUnknownSync(
              Schema.parseJson(AggregateFrontendLockSchema),
            )(catalogRow.aggregateFrontendLock, {
              onExcessProperty: 'error',
            });
            if (
              Schema.encodeUnknownSync(
                Schema.parseJson(AggregateFrontendLockSchema),
              )(storedLock, { onExcessProperty: 'error' }) !== encodedLock
            ) {
              throw new ZerospinError({
                code: 'aggregate-frontend-replica-definition-mismatch',
                message:
                  'Persisted aggregate frontend lock differs at the exact key',
              });
            }
            if (catalogRow.frontendSpec !== encodedSpec) {
              throw new ZerospinError({
                code: 'aggregate-frontend-replica-spec-mismatch',
                message:
                  'Persisted aggregate frontend spec differs at the exact key',
              });
            }
          }
          const isNewCatalogRow = catalogRow === undefined;
          if (catalogRow === undefined) {
            const replicaId = await runtime.runPromise(
              makeIdFromAbbreviation({ abbreviation: 'afrp' }),
            );
            catalogRow = {
              id: replicaId,
              aggregateId: request.aggregateId,
              aggregateName: request.aggregateName,
              userId,
              frontendName: request.frontendName,
              aggregateFrontendLockKey,
              aggregateFrontendLock: encodedLock,
              frontendSpec: encodedSpec,
              databaseName: replicaDatabaseName,
              createdAt: new Date(),
            };
          }

          const runtimeKey = `${systemId}/${userId}/aggregate/${catalogRow.id}`;
          const existingReplicaRuntime =
            aggregateReplicaRuntimes.get(runtimeKey);
          if (existingReplicaRuntime !== undefined) {
            if (existingReplicaRuntime.runtimeStatus === 'failed') {
              throw existingReplicaRuntime.runtimeLastFailure === null
                ? new ZerospinError({
                    code: 'aggregate-frontend-replica-failed',
                    message: 'The exact aggregate replica is terminally failed',
                  })
                : ZerospinError.parse(
                    existingReplicaRuntime.runtimeLastFailure,
                  );
            }
            if (
              request.mode === 'existing-only' &&
              existingReplicaRuntime.runtimeStatus === 'activating'
            ) {
              throw new ZerospinError({
                code: 'cached-aggregate-frontend-replica-unavailable',
                message:
                  'No exact ready aggregate frontend replica is available offline',
              });
            }
            const registration = await existingReplicaRuntime.serialize(() =>
              existingReplicaRuntime.acquire({
                sink: request.sink,
                mode: request.mode,
                ownerToken,
                getAuthenticatedApi,
                getCurrentAuthenticatedApi,
              }),
            );
            registeredRuntime = existingReplicaRuntime;
            registeredId = registration.registrationId;
            registeredWasExisting = registration.registrationWasExisting;
            if (
              request.mode === 'online' &&
              existingReplicaRuntime.requiresOnlineReplacement()
            ) {
              await existingReplicaRuntime.repairFromRegistration({
                replaceState: true,
              });
            }
            return new AggregateFrontendReplicaApi({
              registrationId: registration.registrationId,
              replicaRuntime: existingReplicaRuntime,
              runtime,
            });
          }

          const resourceSchemas: IAnyDrizzleSchemas = {};
          for (const [modelName, modelSpec] of Object.entries(
            request.frontendSpec.models,
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
                  code: 'aggregate-frontend-replica-index-empty',
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
            schema: {
              ...resourceSchemas,
              ...aggregateFrontendReplicaDbConfig.schema,
            },
            relations: aggregateFrontendReplicaDbConfig.relations,
          };
          let replicaSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
          try {
            replicaSqlite = await makeIdbSQLite3({
              databaseName: catalogRow.databaseName,
              vfsName: `${userReplicaStore.vfsName}/aggregate/${catalogRow.id}`,
              wasmUrl: sharedWorkerWasmUrl,
              mode:
                request.mode === 'online' ? 'create-or-open' : 'existing-only',
            });
          } catch (cause) {
            if (ZerospinError.isZerospinError(cause)) throw cause;
            if (request.mode === 'existing-only') {
              throw new ZerospinError({
                code: 'cached-aggregate-frontend-replica-unavailable',
                message:
                  'No exact ready aggregate frontend replica is available offline',
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
                    'The aggregate exact database schema cannot be verified',
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
                      'The aggregate exact database index schema cannot be verified',
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
                  'The aggregate exact database does not match the current persistence baseline',
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
            .from(aggregateFrontendReplicaMetadata)
            .all();
          if (
            metadataRows.length > 1 ||
            (metadataRows.length === 1 && metadataRows[0]?.id !== catalogRow.id)
          ) {
            throw new ZerospinError({
              code: 'browser-persistence-reset-required',
              message:
                'The aggregate exact database metadata does not own this locator',
            });
          }
          let metadataRow = metadataRows[0];
          if (metadataRow === undefined) {
            let hasPersistedContent = false;
            for (const drizzleSchema of [
              ...Object.values(resourceSchemas),
              aggregateFrontendCommandJournal,
            ]) {
              if (
                (await db.select().from(drizzleSchema).limit(1).get()) !==
                undefined
              ) {
                hasPersistedContent = true;
                break;
              }
            }
            if (!isEmptyReplicaDatabase && hasPersistedContent) {
              throw new ZerospinError({
                code: 'browser-persistence-reset-required',
                message:
                  'The aggregate exact database has content without its metadata row',
              });
            }
            if (request.mode !== 'online') {
              throw new ZerospinError({
                code: 'cached-aggregate-frontend-replica-unavailable',
                message:
                  'No exact ready aggregate frontend replica is available offline',
              });
            }
            if (!isNewCatalogRow) {
              throw new ZerospinError({
                code: 'browser-persistence-reset-required',
                message:
                  'The aggregate replica catalog points to an uninitialized exact database',
              });
            }
          } else if (isNewCatalogRow) {
            throw new ZerospinError({
              code: 'browser-persistence-reset-required',
              message:
                'An unpublished aggregate locator resolved persisted exact-replica metadata',
            });
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
                'The aggregate exact database metadata is missing or corrupt',
            });
          }

          let installedSystemVersion = metadataRow?.systemVersion;
          let installedFrontendIndex = metadataRow?.frontendIndex;
          let installedReplicaIndex = metadataRow?.replicaIndex;
          const replicaRow = {
            ...catalogRow,
            get systemVersion(): string {
              if (installedSystemVersion === undefined) {
                throw new ZerospinError({
                  code: 'aggregate-frontend-replica-activation-incomplete',
                  message:
                    'Aggregate frontend metadata is unavailable before activation commits',
                });
              }
              return installedSystemVersion;
            },
            set systemVersion(value: string) {
              installedSystemVersion = value;
            },
            get frontendIndex(): number {
              if (installedFrontendIndex === undefined) {
                throw new ZerospinError({
                  code: 'aggregate-frontend-replica-activation-incomplete',
                  message:
                    'Aggregate frontend metadata is unavailable before activation commits',
                });
              }
              return installedFrontendIndex;
            },
            set frontendIndex(value: number) {
              installedFrontendIndex = value;
            },
            get replicaIndex(): number {
              if (installedReplicaIndex === undefined) {
                throw new ZerospinError({
                  code: 'aggregate-frontend-replica-activation-incomplete',
                  message:
                    'Aggregate frontend metadata is unavailable before activation commits',
                });
              }
              return installedReplicaIndex;
            },
            set replicaIndex(value: number) {
              installedReplicaIndex = value;
            },
          };
          const replicaRuntime = new AggregateFrontendReplicaRepo(
            replicaRow,
            userReplicaStore,
            replicaSqlite,
            db,
            resourceSchemas,
            request.frontendSpec,
            runtime,
            authenticationRuntime,
            systemId,
            systemName,
            sharedWorkerApiUrl,
            allocateRegistrationId,
            aggregateReplicaRuntimes,
            metadataRow === undefined ? 'activating' : 'ready',
            false,
          );
          const registration = await replicaRuntime.serialize(() =>
            replicaRuntime.acquire({
              sink: request.sink,
              mode: request.mode,
              ownerToken,
              getAuthenticatedApi,
              getCurrentAuthenticatedApi,
            }),
          );
          registeredRuntime = replicaRuntime;
          registeredId = registration.registrationId;
          registeredWasExisting = registration.registrationWasExisting;
          if (request.mode === 'online') {
            await replicaRuntime.repairFromRegistration({ replaceState: true });
          } else {
            await replicaRuntime.getSnapshot();
          }
          if (isNewCatalogRow) {
            await userReplicaStore.db
              .insert(aggregateFrontendReplicas)
              .values(catalogRow)
              .run();
            const insertedCatalogRow = await userReplicaStore.db
              .select()
              .from(aggregateFrontendReplicas)
              .where(eq(aggregateFrontendReplicas.id, catalogRow.id))
              .get();
            if (insertedCatalogRow === undefined) {
              throw new ZerospinError({
                code: 'aggregate-frontend-replica-catalog-insert-missing',
                message: 'Inserted aggregate replica catalog row was not found',
              });
            }
          }
          aggregateReplicaRuntimes.set(runtimeKey, replicaRuntime);
          unownedReplicaSqlite = null;
          return new AggregateFrontendReplicaApi({
            registrationId: registration.registrationId,
            replicaRuntime,
            runtime,
          });
        } catch (cause) {
          if (
            registeredRuntime !== null &&
            registeredId !== null &&
            !registeredWasExisting
          ) {
            await registeredRuntime
              .release(registeredId)
              .catch(() => undefined);
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
            code: 'acquire-aggregate-frontend-replica-failed',
            message: 'Failed to acquire aggregate frontend replica',
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
  });
});
