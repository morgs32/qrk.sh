import type { MatchParams } from '@remix-run/route-pattern/match';
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
import type {
  IAnyError,
  IAnyErrorJson,
  IEncodedResult,
} from '@zerospin/error';
import { DurableObject } from 'cloudflare:workers';
import { getTableName } from 'drizzle-orm';
import { Effect, type ManagedRuntime } from 'effect';
import invariant from 'tiny-invariant';

import { getRepoTableRows } from '../getRepoTableRows/getRepoTableRows.js';
import { makeDurableDb } from '../makeDurableDb.js';

import type { IRepoNameUtils } from './makeRepoNameUtils.js';

const IS_BOOTSTRAPPED_KV_KEY = '_isBootstrapped';

/** Shared path-named Durable Object Repo construction and bootstrap lifecycle. */
export function makeDORepo<
  const PATTERN extends string,
  CONFIG extends IDbConfig,
  SERVICES = never,
  GET_DB_CONFIG_ERROR extends IAnyError = IAnyError,
  BOOTSTRAP_ERROR extends IAnyError = IAnyError,
>(props: {
  baseClass?: new (
    ctx: DurableObjectState,
    env: Cloudflare.Env,
  ) => DurableObject<Cloudflare.Env> & Rpc.DurableObjectBranded;
  repoType: IRepoType | undefined;
  managedRuntime: ManagedRuntime.ManagedRuntime<SERVICES, never>;
  nameUtils: IRepoNameUtils<PATTERN>;
  getDbConfig: (props: {
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
    getRepoTableRows(props: {
      tableName: string;
    }): Promise<IEncodedResult<IRepoTableData, IAnyErrorJson>>;
  };
} {
  const {
    baseClass: BaseClass = DurableObject,
    bootstrap,
    getDbConfig,
    initializeSchema,
    managedRuntime,
    nameUtils,
    repoType,
  } = props;

  const initialize = Effect.fn('DORepo.initialize')(function* (props: {
    ctx: DurableObjectState;
  }) {
    const { ctx } = props;
    const name = ctx.id.name;
    invariant(name, 'DORepo must be accessed via getByName');

    const key = yield* nameUtils.parseName(name);
    const dbConfig = yield* getDbConfig({
      key,
      name,
      storage: ctx.storage,
    });
    const { relations, schema } = dbConfig;
    const db = makeDurableDb({
      storage: ctx.storage,
      dbConfig,
    });

    return { db, dbConfig, key, name, relations, schema };
  });

  return class DORepo extends BaseClass {
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

    constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
      super(ctx, env);

      const { db, dbConfig, key, name, relations, schema } =
        managedRuntime.runSync(initialize({ ctx }));
      this.key = key;
      this.name = name;
      this.db = db;
      this.dbConfig = dbConfig;
      this.schema = schema;
      this.relations = relations;

      this.doRepoInitialization = ctx.blockConcurrencyWhile(async () => {
        await managedRuntime.runPromise(
          Effect.gen(function* () {
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

            if (repoType !== undefined) {
              yield* makeAsync<IEncodedResult<void, IAnyErrorJson>>(() =>
                env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID).registerRepo({
                  registration: {
                    repoType,
                    repoName: name,
                    tableNames: Object.values(schema).map(getTableName),
                  },
                }),
              ).pipe(Effect.flatMap(decodeRpc));
            }
          }).pipe(Effect.provide(AsyncLive)),
        );
      });
    }

    getRepoTableRows(props: {
      tableName: string;
    }): Promise<IEncodedResult<IRepoTableData, IAnyErrorJson>> {
      return managedRuntime.runPromise(
        getRepoTableRows({
          db: this.db,
          schema: this.schema,
          tableName: props.tableName,
        }).pipe(Effect.provide(AsyncLive), encodeRpc),
      );
    }
  };
}
