import type { RoutePattern } from '@remix-run/route-pattern';
import type { MatchParams } from '@remix-run/route-pattern/match';
import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type {
  IDb,
  IDbConfig,
  IDbConfigRelations,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import type { IRepoType } from '@zerospin/core/system/types';
import type { IAnyError } from '@zerospin/error';
import { Effect, type ManagedRuntime } from 'effect';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';

import type { IFixedDORepoConfig } from './types.js';

/** FixedDORepo configuration: name statics, runtime, database config, and bootstrap. */
/*
 * Repo declarations normalize their fixed lifecycle configuration here.
 * The result binds name utilities, runtime, database resolution, and bootstrap.
 *
 * 1. Bind the physical-name contract.
 * 2. Normalize static and computed database configuration.
 * 3. Return the lifecycle configuration.
 * 4. Handle omitted bootstrap work.
 * 5. Run authored bootstrap with the async bridge.
 */
export function makeFixedDORepoConfig<
  const PATTERN extends string,
  CONFIG extends IDbConfig,
  SERVICES = never,
  GET_DB_CONFIG_ERROR extends IAnyError = IAnyError,
  BOOTSTRAP_ERROR extends IAnyError = IAnyError,
>(props: {
  abbreviation: string | undefined;
  repoType?: IRepoType;
  namePattern: RoutePattern<PATTERN>;
  managedRuntime: ManagedRuntime.ManagedRuntime<SERVICES, never>;
  dbConfig:
    | CONFIG
    | ((props: {
        name: string;
        key: MatchParams<PATTERN>;
        storage: DurableObjectStorage;
      }) => Effect.Effect<CONFIG, GET_DB_CONFIG_ERROR, SERVICES>);
  bootstrap?: (props: {
    ctx: DurableObjectState;
    name: string;
    key: MatchParams<PATTERN>;
    db: IDb<CONFIG>;
    dbConfig: CONFIG;
    schema: IDbConfigSchema<CONFIG>;
    relations: IDbConfigRelations<CONFIG>;
  }) => Effect.Effect<void, BOOTSTRAP_ERROR, SERVICES | Async>;
}): IFixedDORepoConfig<
  PATTERN,
  CONFIG,
  SERVICES,
  GET_DB_CONFIG_ERROR,
  BOOTSTRAP_ERROR
> {
  const {
    abbreviation,
    bootstrap,
    dbConfig,
    managedRuntime,
    namePattern,
    repoType,
  } = props;

  // 1 — create matching makeName and parseName operations
  const nameUtils = makeRepoNameUtils({ abbreviation, namePattern });

  // 2 — retain a resolver function or lift a static config into Effect.succeed
  const normalizedDbConfig = (() => {
    if (typeof dbConfig === 'function') {
      return dbConfig;
    }
    return (_props: {
      name: string;
      key: MatchParams<PATTERN>;
      storage: DurableObjectStorage;
    }) => Effect.succeed(dbConfig);
  })();

  // 3 — retain repoType, pattern source, managedRuntime, and normalized dbConfig
  return {
    repoType,
    namePattern: namePattern.source,
    managedRuntime,
    nameUtils,
    dbConfig: normalizedDbConfig,
    bootstrap(bootstrapProps: {
      ctx: DurableObjectState;
      name: string;
      key: MatchParams<PATTERN>;
      db: IDb<CONFIG>;
      dbConfig: CONFIG;
      schema: IDbConfigSchema<CONFIG>;
      relations: IDbConfigRelations<CONFIG>;
    }) {
      // 4 — return Effect.void when the owner supplied no bootstrap
      if (bootstrap === undefined) {
        return Effect.void;
      }

      // 5 — provide AsyncLive without changing the owner bootstrap context
      return bootstrap(bootstrapProps).pipe(Effect.provide(AsyncLive));
    },
  };
}
