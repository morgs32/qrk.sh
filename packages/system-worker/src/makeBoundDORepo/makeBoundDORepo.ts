import type { MatchParams } from '@remix-run/route-pattern/match';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { migrateDb } from '@zerospin/core/drizzle/migrateDb';
import type {
  IDb,
  IDbConfig,
  IDbConfigRelations,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import type { IRepoTableData } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IAnyError, IAnyErrorJson } from '@zerospin/error';
import { DurableObject } from 'cloudflare:workers';
import { getTableName } from 'drizzle-orm';
import { Effect, type Schema } from 'effect';
import invariant from 'tiny-invariant';

import { getRepoTableRows } from '../getRepoTableRows/getRepoTableRows.js';
import { makeDurableDb } from '../makeDurableDb.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

import type { IBoundDORepoConfig } from './types.js';

const IS_BOOTSTRAPPED_KV_KEY = '_isBootstrapped';

/** Path-named Durable Object Repo with provision-once schema and bootstrap lifecycle. */
export function makeBoundDORepo<
  const PATTERN extends string,
  CONFIG extends IDbConfig,
  SERVICES = never,
  GET_DB_CONFIG_ERROR extends IAnyError = IAnyError,
  BOOTSTRAP_ERROR extends IAnyError = IAnyError,
>(props: {
  baseClass?: new (
    ctx: DurableObjectState,
    env: Cloudflare.Env,
  ) => DurableObject<Cloudflare.Env>;
  boundDORepoConfig: IBoundDORepoConfig<
    PATTERN,
    CONFIG,
    SERVICES,
    GET_DB_CONFIG_ERROR,
    BOOTSTRAP_ERROR
  >;
}): {
  readonly boundDORepoConfig: IBoundDORepoConfig<
    PATTERN,
    CONFIG,
    SERVICES,
    GET_DB_CONFIG_ERROR,
    BOOTSTRAP_ERROR
  >;
  new (
    ctx: DurableObjectState,
    env: Cloudflare.Env,
  ): {
    readonly ctx: DurableObjectState;
    readonly env: Cloudflare.Env;
    readonly key: MatchParams<PATTERN>;
    readonly db: IDb<CONFIG>;
    readonly dbConfig: CONFIG;
    readonly schema: IDbConfigSchema<CONFIG>;
    readonly relations: IDbConfigRelations<CONFIG>;
    readonly boundDORepoInitialization: Promise<void>;
    getRepoTableRows(props: {
      tableName: string;
    }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>>;
  };
} {
  const { baseClass: BaseClass = DurableObject, boundDORepoConfig } = props;

  /*
   * 1. Read the encoded Repo key from the Durable Object name.
   * 2. Validate the key through boundDORepoConfig.
   * 3. Resolve db config from name + key + storage.
   * 4. Return constructor-owned fields for direct assignment.
   */
  const initialize = Effect.fn('BoundDORepo.initialize')(function* (props: {
    ctx: DurableObjectState;
  }) {
    const { ctx } = props;
    // 1 — Repo keys are encoded into the Durable Object name.
    const name = ctx.id.name;
    invariant(name, 'BoundDORepo must be accessed via getByName');

    // 2 — boundDORepoConfig remains the single parser for path-style names.
    const key = yield* boundDORepoConfig.nameUtils.parseName(name);

    // 3 — Dynamic db config selection gets the durable name, parsed key, and storage handle.
    const dbConfig = yield* boundDORepoConfig.getDbConfig({
      key,
      name,
      storage: ctx.storage,
    });
    const { relations, schema } = dbConfig;
    const db = makeDurableDb({
      storage: ctx.storage,
      dbConfig,
    });

    // 4 — constructor assigns these fields directly.
    return { db, dbConfig, key, name, relations, schema };
  });

  /*
   * 1. Provision the Drizzle schema opened during constructor initialization.
   */
  const provisionSchema = Effect.fn('BoundDORepo.provisionSchema')(
    function* (props: { db: IDb<CONFIG>; schema: IDbConfigSchema<CONFIG> }) {
      const { db, schema } = props;

      // 1 — provision the schema opened during constructor initialization.
      yield* migrateDb({
        db,
        schema,
      });
    },
  );

  const bootstrap = Effect.fn('BoundDORepo.bootstrap')(function* (props: {
    ctx: DurableObjectState;
    name: string;
    key: MatchParams<PATTERN>;
    db: IDb<CONFIG>;
    dbConfig: CONFIG;
    schema: IDbConfigSchema<CONFIG>;
    relations: IDbConfigRelations<CONFIG>;
  }) {
    if (!boundDORepoConfig.bootstrap) {
      return;
    }

    yield* boundDORepoConfig.bootstrap(props);
  });

  return class BoundDORepo extends BaseClass {
    declare readonly ctx: DurableObjectState;
    declare readonly env: Cloudflare.Env;

    static readonly boundDORepoConfig = boundDORepoConfig;

    readonly key: MatchParams<PATTERN>;
    readonly db: IDb<CONFIG>;
    readonly dbConfig: CONFIG;
    readonly schema: IDbConfigSchema<CONFIG>;
    readonly relations: IDbConfigRelations<CONFIG>;
    readonly boundDORepoInitialization: Promise<void>;

    constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
      super(ctx, env);

      const { db, dbConfig, key, name, relations, schema } =
        boundDORepoConfig.managedRuntime.runSync(initialize({ ctx }));
      this.key = key;
      this.db = db;
      this.dbConfig = dbConfig;
      this.schema = schema;
      this.relations = relations;

      this.boundDORepoInitialization = ctx.blockConcurrencyWhile(async () => {
        await boundDORepoConfig.managedRuntime.runPromise(
          Effect.gen(function* () {
            if (ctx.storage.kv.get(IS_BOOTSTRAPPED_KV_KEY) !== 'true') {
              yield* provisionSchema({ db, schema });
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

            const repoType = boundDORepoConfig.repoType;
            if (repoType !== undefined) {
              /*
               * Register against the generation parsed from this Repo's own
               * Durable Object name. A source-generation Repo opened during
               * replay must never register itself in the destination
               * generation's SystemRepo.
               */
              invariant(
                'generationId' in key,
                'Registered Repo names must include generationId',
              );
              const generationId = key.generationId;
              invariant(
                typeof generationId === 'string' && generationId.length > 0,
                'Registered Repo names must include generationId',
              );
              yield* makeAsync(() =>
                SystemRepo.getRepo({
                  systemId: env.ZEROSPIN_SYSTEM_ID,
                }).registerRepo({
                  registration: {
                    generationId,
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
    }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
      return boundDORepoConfig.managedRuntime.runPromise(
        getRepoTableRows({
          db: this.db,
          schema: this.schema,
          tableName: props.tableName,
        }).pipe(Effect.provide(AsyncLive), encodeRpc),
      );
    }
  };
}
