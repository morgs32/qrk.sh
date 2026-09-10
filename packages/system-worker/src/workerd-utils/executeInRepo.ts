import type { MatchParams } from '@remix-run/route-pattern/match';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type {
  IDb,
  IDbConfig,
  IDbConfigRelations,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import type { IAnyError } from '@zerospin/error';
import { runInDurableObject } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/durable-sqlite';
import { Effect, type ManagedRuntime } from 'effect';

/*
 * Workerd tests enter a real Repo Durable Object and reconstruct its typed
 * SQLite binding for assertions or fixture setup. The helper uses the Repo name
 * contract and configuration while exposing the actual Durable Object state.
 *
 * 1. Encode the target Repo name.
 * 2. Resolve the live Repo stub.
 * 3. Enter the selected Durable Object.
 * 4. Resolve the same Repo database configuration.
 * 5. Bind foreign-key-enabled Drizzle.
 * 6. Run the test operation with Repo internals.
 */
export async function executeInRepo<
  CONFIG extends IDbConfig,
  SERVICES,
  RESULT,
>(props: {
  managedRuntime: ManagedRuntime.ManagedRuntime<SERVICES, never>;
  getRepo: (props: {
    key: MatchParams<string>;
  }) => Effect.Effect<DurableObjectStub<Rpc.DurableObjectBranded>, IAnyError>;
  repo: {
    fixedDORepoConfig: {
      nameUtils: {
        makeName(
          ...args: readonly unknown[]
        ): Effect.Effect<string, IAnyError, never>;
      };
      dbConfig(props: {
        name: string;
        key: MatchParams<string>;
        storage: DurableObjectStorage;
      }): Effect.Effect<CONFIG, IAnyError, SERVICES>;
    };
  };
  key: MatchParams<string>;
  fn: (internals: {
    db: IDb<CONFIG>;
    schema: IDbConfigSchema<CONFIG>;
    drizzleSchema: IDbConfigSchema<CONFIG>;
    relations: IDbConfigRelations<CONFIG>;
    key: MatchParams<string>;
    name: string;
    state: DurableObjectState;
  }) => RESULT | Promise<RESULT>;
}): Promise<Awaited<RESULT>> {
  const { fn, getRepo, key, managedRuntime, repo } = props;
  const { fixedDORepoConfig } = repo;

  // 1 — use fixedDORepoConfig.nameUtils with the supplied key
  const name = Effect.runSync(fixedDORepoConfig.nameUtils.makeName(key));

  // 2 — run the supplied getRepo Effect in the test runtime
  const stub = await managedRuntime.runPromise(getRepo({ key }));

  // 3 — invoke the test callback against its actual state
  return runInDurableObject<Rpc.DurableObjectBranded, Awaited<RESULT>>(
    stub,
    async (_instance, state) => {
      // 4 — provide state.storage, key, and physical name with AsyncLive
      const dbConfig = await managedRuntime.runPromise(
        fixedDORepoConfig
          .dbConfig({
            storage: state.storage,
            name,
            key,
          })
          .pipe(Effect.provide(AsyncLive)),
      );

      // 5 — enable foreign keys and use the configured relations
      state.storage.sql.exec('PRAGMA foreign_keys = ON;');
      const db = drizzle(state.storage, {
        relations: dbConfig.relations,
      }) as IDb<CONFIG>;

      // 6 — expose db, schema, relations, key, name, and Durable Object state
      return await fn({
        db,
        schema: dbConfig.schema,
        drizzleSchema: dbConfig.schema,
        relations: dbConfig.relations,
        key,
        name,
        state,
      });
    },
  );
}
