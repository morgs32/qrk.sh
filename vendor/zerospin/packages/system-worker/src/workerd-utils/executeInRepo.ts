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
    repoUtils: {
      nameUtils: {
        makeName(
          ...args: readonly unknown[]
        ): Effect.Effect<string, IAnyError, never>;
      };
      getDbConfig(props: {
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
    storage: DurableObjectStorage;
  }) => RESULT | Promise<RESULT>;
}): Promise<Awaited<RESULT>> {
  const { fn, getRepo, key, managedRuntime, repo } = props;
  const { repoUtils } = repo;
  const name = Effect.runSync(repoUtils.nameUtils.makeName(key));
  const stub = await managedRuntime.runPromise(getRepo({ key }));

  return runInDurableObject<Rpc.DurableObjectBranded, Awaited<RESULT>>(
    stub,
    async (_instance, state) => {
      const dbConfig = await managedRuntime.runPromise(
        repoUtils
          .getDbConfig({
            storage: state.storage,
            name,
            key,
          })
          .pipe(Effect.provide(AsyncLive)),
      );
      const { relations, schema } = dbConfig;
      const db = drizzle(state.storage, {
        schema,
        relations,
      }) as IDb<CONFIG>;

      return await fn({
        db,
        schema,
        drizzleSchema: schema,
        relations,
        key,
        name,
        storage: state.storage,
      });
    },
  );
}
