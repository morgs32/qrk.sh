import type { MatchParams } from '@remix-run/route-pattern/match';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb';
import type {
  IDb,
  IDbConfig,
  IDbConfigRelations,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import type { IRepoTableData } from '@zerospin/core/system/types';
import type {
  IAnyError,
  IAnyErrorJson,
  IEncodedResult,
} from '@zerospin/error';
import type { DurableObject } from 'cloudflare:workers';
import { Effect } from 'effect';

import { makeDORepo } from '../makeDORepo/makeDORepo.js';

import type { IFixedDORepoConfig } from './types.js';

/** Path-named Durable Object Repo with provision-once schema and bootstrap lifecycle. */
export function makeFixedDORepo<
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
  fixedDORepoConfig: IFixedDORepoConfig<
    PATTERN,
    CONFIG,
    SERVICES,
    GET_DB_CONFIG_ERROR,
    BOOTSTRAP_ERROR
  >;
}): {
  readonly fixedDORepoConfig: IFixedDORepoConfig<
    PATTERN,
    CONFIG,
    SERVICES,
    GET_DB_CONFIG_ERROR,
    BOOTSTRAP_ERROR
  >;
  new (
    ctx: DurableObjectState,
    env: Cloudflare.Env,
  ): Rpc.DurableObjectBranded & {
    readonly ctx: DurableObjectState;
    readonly env: Cloudflare.Env;
    readonly name: string;
    readonly key: MatchParams<PATTERN>;
    readonly db: IDb<CONFIG>;
    readonly dbConfig: CONFIG;
    readonly schema: IDbConfigSchema<CONFIG>;
    readonly relations: IDbConfigRelations<CONFIG>;
    readonly fixedDORepoInitialization: Promise<void>;
    getRepoTableRows(props: {
      tableName: string;
    }): Promise<IEncodedResult<IRepoTableData, IAnyErrorJson>>;
  };
} {
  const { baseClass, fixedDORepoConfig } = props;

  const initializeSchema = Effect.fn('FixedDORepo.initializeSchema')(
    function* (props: {
      db: IDb<CONFIG>;
      schema: IDbConfigSchema<CONFIG>;
      isBootstrapped: boolean;
    }) {
      const { db, isBootstrapped, schema } = props;
      if (isBootstrapped) {
        return;
      }

      yield* provisionDb({ db, schema });
    },
  );

  const FixedDORepoBase = makeDORepo({
    ...(baseClass === undefined ? {} : { baseClass }),
    ...fixedDORepoConfig,
    initializeSchema,
  });

  return class FixedDORepo extends FixedDORepoBase {
    static readonly fixedDORepoConfig = fixedDORepoConfig;

    readonly fixedDORepoInitialization = this.doRepoInitialization;
  };
}
