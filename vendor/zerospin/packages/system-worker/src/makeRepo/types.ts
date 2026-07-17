import type { MatchParams } from '@remix-run/route-pattern/match';
import type {
  IDb,
  IDbConfig,
  IDbConfigRelations,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import type { IRepoType } from '@zerospin/core/system/types';
import type { IAnyError } from '@zerospin/error';
import type { Effect, ManagedRuntime } from 'effect';

import type { IRepoNameUtils } from './makeRepoNameUtils.js';

export type IRepoUtils<
  PATTERN extends string,
  CONFIG extends IDbConfig = IDbConfig,
  SERVICES = never,
  GET_DB_CONFIG_ERROR extends IAnyError = IAnyError,
  BOOTSTRAP_ERROR extends IAnyError = IAnyError,
> = {
  readonly repoType: IRepoType | undefined;
  readonly namePattern: PATTERN;
  managedRuntime: ManagedRuntime.ManagedRuntime<SERVICES, never>;
  nameUtils: IRepoNameUtils<PATTERN>;
  getDbConfig: (props: {
    name: string;
    key: MatchParams<PATTERN>;
    storage: DurableObjectStorage;
  }) => Effect.Effect<CONFIG, GET_DB_CONFIG_ERROR, SERVICES>;
  bootstrap(props: {
    ctx: DurableObjectState;
    name: string;
    key: MatchParams<PATTERN>;
    db: IDb<CONFIG>;
    dbConfig: CONFIG;
    schema: IDbConfigSchema<CONFIG>;
    relations: IDbConfigRelations<CONFIG>;
  }): Effect.Effect<void, BOOTSTRAP_ERROR, SERVICES>;
};
