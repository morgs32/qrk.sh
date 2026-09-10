import type { MatchParams } from '@remix-run/route-pattern/match';
import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type {
  IDb,
  IDbConfig,
  IDbConfigRelations,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import type { IRepoTableData, IRepoType } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { DurableObject, env } from 'cloudflare:workers';
import { getTableName } from 'drizzle-orm';
import { Effect, type ManagedRuntime } from 'effect';
import { system } from 'system';
import invariant from 'tiny-invariant';

import type { AggregateChain } from '../AggregateChain/AggregateChain.js';
import type { FrontendServiceChain } from '../FrontendServiceChain/FrontendServiceChain.js';
import type { FrontendVersionedServiceRepo } from '../FrontendVersionedServiceRepo/FrontendVersionedServiceRepo.js';
import { getRepoTableRows } from '../getRepoTableRows/getRepoTableRows.js';
import { getSystemSpec } from '../getSystemSpec/getSystemSpec.js';
import {
  makeAlarmRegistry,
  type IAlarmRegistry,
} from '../makeAlarmRegistry/makeAlarmRegistry.js';
import { makeDurableDb } from '../makeDurableDb.js';
import type { ServiceAdmittedChain } from '../ServiceAdmittedChain/ServiceAdmittedChain.js';
import type { SystemLogAgent } from '../SystemLogAgent/SystemLogAgent.js';
import type { SystemLogRepo } from '../SystemLogRepo/SystemLogRepo.js';
import type { SystemRepo } from '../SystemRepo/SystemRepo.js';
import type { UserVersionedAggregateChain } from '../UserVersionedAggregateChain/UserVersionedAggregateChain.js';
import type { UserVersionedAggregateRepo } from '../UserVersionedAggregateRepo/UserVersionedAggregateRepo.js';
import type { VersionedAggregateChain } from '../VersionedAggregateChain/VersionedAggregateChain.js';
import type { VersionedAggregateRepo } from '../VersionedAggregateRepo/VersionedAggregateRepo.js';
import type { VersionedServiceChain } from '../VersionedServiceChain/VersionedServiceChain.js';
import type { VersionedServiceRepo } from '../VersionedServiceRepo/VersionedServiceRepo.js';

import type { IRepoNameUtils } from './makeRepoNameUtils.js';

/** Namespace names stay explicit so deriving the base never inspects its subclasses. */
declare global {
  namespace Cloudflare {
    interface DORepoNamespaces {
      SYSTEM_REPO: {
        getByName(
          name: string,
          options?: DurableObjectNamespaceGetDurableObjectOptions,
        ): Pick<
          SystemRepo,
          | 'initialize'
          | 'checkSystemSpec'
          | 'createAggregateFrontendWebSocketTicket'
          | 'consumeAggregateFrontendWebSocketTicket'
          | 'createServiceFrontendWebSocketTicket'
          | 'consumeServiceFrontendWebSocketTicket'
          | 'registerRepo'
          | 'registerRepos'
          | 'getRepoRegistrations'
          | 'getRepoTableRows'
        >;
      };
      VERSIONED_AGGREGATE_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & VersionedAggregateRepo
      >;
      VERSIONED_SERVICE_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & VersionedServiceRepo
      >;
      AGGREGATE_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & AggregateChain
      >;
      VERSIONED_AGGREGATE_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & VersionedAggregateChain
      >;
      VERSIONED_SERVICE_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & VersionedServiceChain
      >;
      USER_VERSIONED_AGGREGATE_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & UserVersionedAggregateRepo
      >;
      USER_VERSIONED_AGGREGATE_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & UserVersionedAggregateChain
      >;
      SERVICE_ADMITTED_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & ServiceAdmittedChain
      >;
      FRONTEND_VERSIONED_SERVICE_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & FrontendVersionedServiceRepo
      >;
      FRONTEND_SERVICE_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & FrontendServiceChain
      >;
      SYSTEM_LOG_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & SystemLogRepo
      >;
      SYSTEM_LOG_AGENT: DurableObjectNamespace<
        Rpc.DurableObjectBranded & SystemLogAgent
      >;
    }
  }
}

const IS_BOOTSTRAPPED_KV_KEY = '_isBootstrapped';

/** Shared path-named Durable Object Repo construction and bootstrap lifecycle. */
/*
 * Fixed and evolving-schema Repo factories share this named Durable Object
 * lifecycle. It resolves identity and database configuration, serializes startup,
 * and records bootstrap completion only after schema and bootstrap work succeed.
 *
 * 1. Select the Durable Object base.
 * 2. Build synchronous identity and database initialization.
 * 3. Construct the Repo instance surface.
 * 4. Initialize instance state synchronously.
 * 5. Serialize asynchronous startup.
 * 6. Require accepted definitions and register the known instance.
 * 7. Apply the selected schema policy.
 * 8. Run and mark first bootstrap.
 * 9. Complete the subclass activation hook.
 * 10. Serve readiness and table inspection after the activation gate opens.
 */
export function makeDORepo<
  const PATTERN extends string,
  CONFIG extends IDbConfig,
  BINDING extends keyof Cloudflare.DORepoNamespaces,
  SERVICES = never,
  GET_DB_CONFIG_ERROR extends IAnyError = IAnyError,
  BOOTSTRAP_ERROR extends IAnyError = IAnyError,
>(props: {
  namespaceBinding: BINDING;
  baseClass:
    | null
    | (new (
        ctx: DurableObjectState,
        env: Cloudflare.Env,
      ) => DurableObject<Cloudflare.Env> & Rpc.DurableObjectBranded);
  repoType: IRepoType | undefined;
  managedRuntime: ManagedRuntime.ManagedRuntime<SERVICES, never>;
  nameUtils: IRepoNameUtils<PATTERN>;
  dbConfig: (props: {
    name: string;
    key: MatchParams<PATTERN>;
    storage: DurableObjectStorage;
  }) => Effect.Effect<CONFIG, GET_DB_CONFIG_ERROR, SERVICES>;
  initializeSchema: (props: {
    ctx: DurableObjectState;
    name: string;
    key: MatchParams<PATTERN>;
    db: IDb<CONFIG>;
    dbConfig: CONFIG;
    schema: IDbConfigSchema<CONFIG>;
    relations: IDbConfigRelations<CONFIG>;
    isBootstrapped: boolean;
  }) => Effect.Effect<void, IAnyError, SERVICES>;
  bootstrap: (props: {
    ctx: DurableObjectState;
    name: string;
    key: MatchParams<PATTERN>;
    db: IDb<CONFIG>;
    dbConfig: CONFIG;
    schema: IDbConfigSchema<CONFIG>;
    relations: IDbConfigRelations<CONFIG>;
  }) => Effect.Effect<void, BOOTSTRAP_ERROR, SERVICES>;
}): {
  readonly getRepo: (props: {
    key: Parameters<IRepoNameUtils<PATTERN>['makeName']>[0];
  }) => Effect.Effect<
    ReturnType<Cloudflare.DORepoNamespaces[BINDING]['getByName']>,
    Effect.Error<ReturnType<IRepoNameUtils<PATTERN>['makeName']>>
  >;
  new (
    ctx: DurableObjectState,
    env: Cloudflare.Env,
  ): Rpc.DurableObjectBranded & {
    readonly ctx: DurableObjectState;
    readonly env: Cloudflare.Env;
    readonly key: MatchParams<PATTERN>;
    readonly name: string;
    readonly db: IDb<CONFIG>;
    readonly dbConfig: CONFIG;
    readonly schema: IDbConfigSchema<CONFIG>;
    readonly relations: IDbConfigRelations<CONFIG>;
    readonly doRepoInitialization: Promise<void>;
    readonly alarmRegistry: IAlarmRegistry;
    alarm(): Promise<void>;
    onDOActivation(): Effect.Effect<void, IAnyError, SERVICES | Async>;
    ready(): Promise<IEncodedResult<void, IAnyErrorJson>>;
    getRepoTableRows(props: {
      tableName: string;
    }): Promise<IEncodedResult<IRepoTableData, IAnyErrorJson>>;
  };
} {
  const {
    baseClass,
    bootstrap,
    dbConfig: dbConfigFn,
    initializeSchema,
    managedRuntime,
    nameUtils,
    namespaceBinding,
    repoType,
  } = props;

  // 1 — use the supplied baseClass or Cloudflare DurableObject
  const BaseClass = baseClass ?? DurableObject;

  // 2 — require getByName identity, parse its key, and resolve the database config
  const initialize = Effect.fn('DORepo.initialize')(function* (props: {
    ctx: DurableObjectState;
  }) {
    const { ctx } = props;
    const name = ctx.id.name;
    invariant(name, 'DORepo must be accessed via getByName');

    const key = yield* nameUtils.parseName(name);
    if (
      'aggregateVersion' in key &&
      'aggregateName' in key &&
      typeof key.aggregateVersion === 'string' &&
      typeof key.aggregateName === 'string'
    ) {
      if (
        !Object.hasOwn(
          system.aggregates[key.aggregateName] ?? {},
          key.aggregateVersion,
        )
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-version-unavailable',
          message: 'Aggregate version is not listed in this deployment',
        });
      }
    }
    if (
      'serviceVersion' in key &&
      'serviceName' in key &&
      typeof key.serviceVersion === 'string' &&
      typeof key.serviceName === 'string'
    ) {
      if (
        !Object.hasOwn(
          system.services[key.serviceName] ?? {},
          key.serviceVersion,
        )
      ) {
        return yield* new ZerospinError({
          code: 'service-version-unavailable',
          message: 'Service version is not listed in this deployment',
        });
      }
    }
    const resolvedDbConfig = yield* dbConfigFn({
      key,
      name,
      storage: ctx.storage,
    });
    const db = makeDurableDb({
      storage: ctx.storage,
      dbConfig: resolvedDbConfig,
    });

    return {
      db,
      dbConfig: resolvedDbConfig,
      key,
      name,
      relations: resolvedDbConfig.relations,
      schema: resolvedDbConfig.schema,
    };
  });

  // 3 — expose the bound key, physical name, database, and initialization promise
  return class DORepo extends BaseClass {
    /** Resolve a stub lazily; activation and authorization belong to the receiver. */
    static readonly getRepo = Effect.fn('DORepo.getRepo')(function* (props: {
      key: Parameters<IRepoNameUtils<PATTERN>['makeName']>[0];
    }) {
      const name = yield* nameUtils.makeName(props.key);
      const namespaces: {
        [K in keyof Cloudflare.DORepoNamespaces]: {
          getByName(
            name: string,
          ): ReturnType<Cloudflare.DORepoNamespaces[K]['getByName']>;
        };
      } = env;
      return namespaces[namespaceBinding].getByName(name);
    });

    // oxlint-disable-next-line no-undef -- Cloudflare supplies the ambient Rpc namespace; this declare field is erased.
    declare [Rpc.__DURABLE_OBJECT_BRAND]: never;
    declare readonly ctx: DurableObjectState;
    declare readonly env: Cloudflare.Env;

    readonly key: MatchParams<PATTERN>;
    readonly name: string;
    readonly db: IDb<CONFIG>;
    readonly dbConfig: CONFIG;
    readonly schema: IDbConfigSchema<CONFIG>;
    readonly relations: IDbConfigRelations<CONFIG>;
    readonly doRepoInitialization: Promise<void>;
    readonly alarmRegistry: IAlarmRegistry;

    constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
      super(ctx, env);
      this.alarmRegistry = makeAlarmRegistry({ storage: ctx.storage });
      const baseAlarm = baseClass?.prototype.alarm;
      if (baseAlarm !== undefined) {
        this.alarmRegistry.register(
          'baseClassAlarm',
          makeAsync(async () => baseAlarm.call(this)),
        );
      }

      // 4 — run the identity/db Effect before assigning readonly fields
      const { db, dbConfig, key, name, relations, schema } =
        managedRuntime.runSync(initialize({ ctx }));
      this.key = key;
      this.name = name;
      this.db = db;
      this.dbConfig = dbConfig;
      this.schema = schema;
      this.relations = relations;

      // 5 — keep incoming events gated until derived fields, schema, bootstrap, and activation are ready
      this.doRepoInitialization = ctx.blockConcurrencyWhile(async () => {
        // A base constructor runs before derived field initializers. Defer all
        // asynchronous startup so overrides may safely access those fields.
        await Promise.resolve();

        await managedRuntime.runPromise(
          Effect.gen({ self: this }, function* () {
            // 6 — reject unaccepted definitions before any storage access or initialization
            if (repoType !== undefined) {
              const spec = yield* getSystemSpec();
              yield* makeAsync<IEncodedResult<void, IAnyErrorJson>>(() =>
                env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID).registerRepo({
                  spec,
                  registration: {
                    repoType,
                    repoName: name,
                    tableNames: Object.values(schema).map(getTableName),
                  },
                }),
              ).pipe(Effect.flatMap(decodeRpc));
            }

            ctx.storage.sql.exec('PRAGMA foreign_keys = ON;');

            // 7 — read _isBootstrapped and pass it to initializeSchema on every activation
            const isBootstrapped =
              ctx.storage.kv.get(IS_BOOTSTRAPPED_KV_KEY) === 'true';
            yield* initializeSchema({
              ctx,
              db,
              dbConfig,
              isBootstrapped,
              key,
              name,
              relations,
              schema,
            });

            // 8 — write the marker only after bootstrap succeeds
            if (!isBootstrapped) {
              yield* bootstrap({
                ctx,
                db,
                dbConfig,
                key,
                name,
                schema,
                relations,
              });
              ctx.storage.kv.put(IS_BOOTSTRAPPED_KV_KEY, 'true');
            }

            // 9 — every activation completes owner startup after successful bootstrap
            yield* this.onDOActivation();
          }).pipe(Effect.provide(AsyncLive)),
        );
      });
    }

    onDOActivation(): Effect.Effect<void, IAnyError, SERVICES | Async> {
      return Effect.void;
    }

    /** The activation gate opens before Cloudflare dispatches registered recovery. */
    alarm(): Promise<void> {
      return managedRuntime.runPromise(
        this.alarmRegistry.run().pipe(Effect.provide(AsyncLive)),
      );
    }

    ready(): Promise<IEncodedResult<void, IAnyErrorJson>> {
      // Incoming RPCs reach this method only after the constructor gate opens.
      return managedRuntime.runPromise(encodeRpc(Effect.void));
    }

    getRepoTableRows(props: {
      tableName: string;
    }): Promise<IEncodedResult<IRepoTableData, IAnyErrorJson>> {
      // 10 — provide AsyncLive and encode getRepoTableRows at the RPC boundary
      const { tableName } = props;
      return managedRuntime.runPromise(
        getRepoTableRows({
          db: this.db,
          schema: this.schema,
          tableName,
        }).pipe(Effect.provide(AsyncLive), encodeRpc),
      );
    }
  };
}
