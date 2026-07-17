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

import { makeRepoNameUtils } from './makeRepoNameUtils.js';
import type { IRepoUtils } from './types.js';

/** Path-named Durable Object repo utilities: name statics and db config. */
export function makeRepoUtils<
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
  getDbConfig: (props: {
    name: string;
    key: MatchParams<PATTERN>;
    storage: DurableObjectStorage;
  }) => Effect.Effect<CONFIG, GET_DB_CONFIG_ERROR, SERVICES>;
  bootstrap?: (props: {
    ctx: DurableObjectState;
    name: string;
    key: MatchParams<PATTERN>;
    db: IDb<CONFIG>;
    dbConfig: CONFIG;
    schema: IDbConfigSchema<CONFIG>;
    relations: IDbConfigRelations<CONFIG>;
  }) => Effect.Effect<void, BOOTSTRAP_ERROR, SERVICES | Async>;
}): IRepoUtils<
  PATTERN,
  CONFIG,
  SERVICES,
  GET_DB_CONFIG_ERROR,
  BOOTSTRAP_ERROR
> {
  const {
    abbreviation,
    bootstrap,
    getDbConfig,
    managedRuntime,
    namePattern,
    repoType,
  } = props;
  const nameUtils = makeRepoNameUtils({ abbreviation, namePattern });

  return {
    repoType,
    namePattern: namePattern.source as PATTERN,
    managedRuntime,
    nameUtils,
    getDbConfig,
    bootstrap(bootstrapProps: {
      ctx: DurableObjectState;
      name: string;
      key: MatchParams<PATTERN>;
      db: IDb<CONFIG>;
      dbConfig: CONFIG;
      schema: IDbConfigSchema<CONFIG>;
      relations: IDbConfigRelations<CONFIG>;
    }) {
      if (bootstrap === undefined) {
        return Effect.void;
      }

      return bootstrap(bootstrapProps).pipe(Effect.provide(AsyncLive));
    },
  };
}
