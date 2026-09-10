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

import type { IRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';

export type IVersionedDORepoMigration = {
  readonly id: number;
  readonly name: string;
  readonly sql: readonly string[];
};

export type IVersionedDORepoConfig<
  PATTERN extends string,
  CONFIG extends IDbConfig = IDbConfig,
  SERVICES = never,
  GET_DB_CONFIG_ERROR extends IAnyError = IAnyError,
  BOOTSTRAP_ERROR extends IAnyError = IAnyError,
> = {
  readonly repoType: IRepoType | undefined;
  readonly namePattern: string;
  managedRuntime: ManagedRuntime.ManagedRuntime<SERVICES, never>;
  nameUtils: IRepoNameUtils<PATTERN>;
  dbConfig: (props: {
    name: string;
    key: MatchParams<PATTERN>;
    storage: DurableObjectStorage;
  }) => Effect.Effect<CONFIG, GET_DB_CONFIG_ERROR, SERVICES>;
  readonly migrations: readonly IVersionedDORepoMigration[];
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
