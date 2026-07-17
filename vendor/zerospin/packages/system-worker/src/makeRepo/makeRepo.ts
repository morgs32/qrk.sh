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

import type { IRepoUtils } from './types.js';

const IS_BOOTSTRAPPED_KV_KEY = '_isBootstrapped';

/** Path-named Durable Object repo shell: name parse, Drizzle open, migration, and bootstrap. */
export function makeRepo<
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
  repoUtils: IRepoUtils<
    PATTERN,
    CONFIG,
    SERVICES,
    GET_DB_CONFIG_ERROR,
    BOOTSTRAP_ERROR
  >;
}): {
  readonly repoUtils: IRepoUtils<
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
    readonly repoInitialization: Promise<void>;
    getRepoTableRows(props: {
      tableName: string;
    }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>>;
  };
} {
  const { baseClass: BaseClass = DurableObject, repoUtils } = props;

  /*
   * 1. Read the encoded repo key from the Durable Object name.
   * 2. Validate the key through repoUtils.
   * 3. Resolve db config from name + key + storage.
   * 4. Return constructor-owned fields for direct assignment.
   */
  const initialize = Effect.fn('Repo.initialize')(function* (props: {
    ctx: DurableObjectState;
  }) {
    const { ctx } = props;
    // 1 — repo keys are encoded into the Durable Object name.
    const name = ctx.id.name;
    invariant(name, 'Durable Object repo must be accessed via getByName');

    // 2 — repoUtils remains the single parser for path-style names.
    const key = yield* repoUtils.nameUtils.parseName(name);

    // 3 — Dynamic db config selection gets the durable name, parsed key, and storage handle.
    const dbConfig = yield* repoUtils.getDbConfig({
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
   * 1. Run Drizzle migration for the schema opened during constructor initialization.
   */
  const migrate = Effect.fn('Repo.migrate')(function* (props: {
    db: IDb<CONFIG>;
    schema: IDbConfigSchema<CONFIG>;
  }) {
    const { db, schema } = props;

    // 1 — migrate the schema opened during constructor initialization.
    yield* migrateDb({
      db,
      schema,
    });
  });

  const bootstrap = Effect.fn('Repo.bootstrap')(function* (props: {
    ctx: DurableObjectState;
    name: string;
    key: MatchParams<PATTERN>;
    db: IDb<CONFIG>;
    dbConfig: CONFIG;
    schema: IDbConfigSchema<CONFIG>;
    relations: IDbConfigRelations<CONFIG>;
  }) {
    if (!repoUtils.bootstrap) {
      return;
    }

    yield* repoUtils.bootstrap(props);
  });

  return class Repo extends BaseClass {
    declare readonly ctx: DurableObjectState;
    declare readonly env: Cloudflare.Env;

    static readonly repoUtils = repoUtils;

    readonly key: MatchParams<PATTERN>;
    readonly db: IDb<CONFIG>;
    readonly dbConfig: CONFIG;
    readonly schema: IDbConfigSchema<CONFIG>;
    readonly relations: IDbConfigRelations<CONFIG>;
    readonly repoInitialization: Promise<void>;

    constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
      super(ctx, env);

      const { db, dbConfig, key, name, relations, schema } =
        repoUtils.managedRuntime.runSync(initialize({ ctx }));
      this.key = key;
      this.db = db;
      this.dbConfig = dbConfig;
      this.schema = schema;
      this.relations = relations;

      this.repoInitialization = ctx.blockConcurrencyWhile(async () => {
        await repoUtils.managedRuntime.runPromise(
          Effect.gen(function* () {
            if (ctx.storage.kv.get(IS_BOOTSTRAPPED_KV_KEY) !== 'true') {
              yield* migrate({ db, schema });
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

            const repoType = repoUtils.repoType;
            if (repoType !== undefined) {
              /*
               * Register against the generation parsed from this repo's own
               * Durable Object name. A source-generation repo opened during
               * replay must never register itself in the destination
              * generation's SystemRepo.
               */
              invariant(
                'generationId' in key,
                'Registered repo names must include generationId',
              );
              const generationId = key.generationId;
              invariant(
                typeof generationId === 'string' && generationId.length > 0,
                'Registered repo names must include generationId',
              );
              yield* makeAsync(() =>
                SystemRepo.getRepo({
                  generationId,
                }).registerRepo({
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
    }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
      return repoUtils.managedRuntime.runPromise(
        getRepoTableRows({
          db: this.db,
          schema: this.schema,
          tableName: props.tableName,
        }).pipe(Effect.provide(AsyncLive), encodeRpc),
      );
    }
  };
}
