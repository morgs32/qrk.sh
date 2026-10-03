import type { MatchParams } from '@remix-run/route-pattern/match';
import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type {
  IDb,
  IDbConfig,
  IDbConfigRelations,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import type { IRepoTableData } from '@zerospin/core/system/types';
import type { IAnyError, IZerospinErrorJson } from '@zerospin/error';
import { makeRpcEnvelope, type IRpcEnvelope } from '@zerospin/logger';
import { DurableObject, env } from 'cloudflare:workers';
import { Effect, type ManagedRuntime } from 'effect';
import invariant from 'tiny-invariant';

import {
  makeAlarmRegistry,
  type IAlarmRegistry,
} from '../makeAlarmRegistry/makeAlarmRegistry.js';

import { getRepoTableRows } from './getRepoTableRows/getRepoTableRows.js';
import { makeDurableDb } from './makeDurableDb.js';
import type { IRepoNameUtils } from './makeRepoNameUtils.js';

/** Repo factories and consumers augment their own namespace bindings. */
declare global {
  namespace Cloudflare {
    interface DORepoNamespaces {}
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
 * 6. Run optional registration before touching storage.
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
  validateKey?: (props: {
    key: MatchParams<PATTERN>;
  }) => Effect.Effect<void, IAnyError, SERVICES>;
  registerRepo?: (props: {
    name: string;
    schema: IDbConfigSchema<CONFIG>;
  }) => Effect.Effect<void, IAnyError | IZerospinErrorJson, SERVICES | Async>;
  managedRuntime: ManagedRuntime.ManagedRuntime<SERVICES, IAnyError>;
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
    ready(): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
    getRepoTableRows(props: {
      tableName: string;
    }): Promise<IRpcEnvelope<IRepoTableData, IZerospinErrorJson>>;
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
    registerRepo,
    validateKey,
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
    if (validateKey !== undefined) {
      yield* validateKey({ key });
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
      const { key } = props;
      const name = yield* nameUtils.makeName(key);
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
            // 6 — allow the factory to register or admit the Repo before storage access
            if (registerRepo !== undefined) {
              yield* registerRepo({ name, schema });
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

    ready() {
      // Incoming RPCs reach this method only after the constructor gate opens.
      return managedRuntime.runPromise(makeRpcEnvelope(Effect.void));
    }

    getRepoTableRows(props: { tableName: string }) {
      const { tableName } = props;
      // 10 — provide AsyncLive and encode getRepoTableRows at the RPC boundary
      return managedRuntime.runPromise(
        getRepoTableRows({
          db: this.db,
          schema: this.schema,
          tableName,
        }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
      );
    }
  };
}
