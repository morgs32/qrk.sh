import type { MatchParams } from '@remix-run/route-pattern/match';
import type { Async } from '@zerospin/core/async/Async';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb';
import type {
  IDb,
  IDbConfig,
  IDbConfigRelations,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import type { IRepoTableData } from '@zerospin/core/system/types';
import type { IAnyError, IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import type { DurableObject } from 'cloudflare:workers';
import { Effect } from 'effect';

import type { IAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';
import { makeDORepo } from '../makeDORepo/makeDORepo.js';

import type { IFixedDORepoConfig } from './types.js';

/** Path-named Durable Object Repo with provision-once schema and bootstrap lifecycle. */
/*
 * Production Repo classes use this provision-once schema lifecycle.
 * makeDORepo owns name parsing and bootstrap marking; this factory skips all
 * schema work on activations whose successful bootstrap marker is retained.
 *
 * 1. Bind the fixed Repo configuration.
 * 2. Define the provision-once schema policy.
 * 3. Skip schema work after bootstrap.
 * 4. Provision the current schema on first activation.
 * 5. Compose the common Repo lifecycle.
 * 6. Expose fixed configuration alongside the inherited activation lifecycle.
 */
export function makeFixedDORepo<
  const PATTERN extends string,
  CONFIG extends IDbConfig,
  BINDING extends keyof Cloudflare.DORepoNamespaces,
  SERVICES = never,
  GET_DB_CONFIG_ERROR extends IAnyError = IAnyError,
  BOOTSTRAP_ERROR extends IAnyError = IAnyError,
>(props: {
  namespaceBinding: BINDING;
  baseClass?:
    | null
    | (new (
        ctx: DurableObjectState,
        env: Cloudflare.Env,
      ) => DurableObject<Cloudflare.Env> & Rpc.DurableObjectBranded);
  fixedDORepoConfig: IFixedDORepoConfig<
    PATTERN,
    CONFIG,
    SERVICES,
    GET_DB_CONFIG_ERROR,
    BOOTSTRAP_ERROR
  >;
}): {
  readonly getRepo: ReturnType<
    typeof makeDORepo<
      PATTERN,
      CONFIG,
      BINDING,
      SERVICES,
      GET_DB_CONFIG_ERROR,
      BOOTSTRAP_ERROR
    >
  >['getRepo'];
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
    readonly doRepoInitialization: Promise<void>;
    readonly alarmRegistry: IAlarmRegistry;
    alarm(): Promise<void>;
    onDOActivation(): Effect.Effect<void, IAnyError, SERVICES | Async>;
    ready(): Promise<IEncodedResult<void, IAnyErrorJson>>;
    getRepoTableRows(props: {
      tableName: string;
    }): Promise<IEncodedResult<IRepoTableData, IAnyErrorJson>>;
  };
} {
  // 1 — retain an optional Durable Object base class
  const { baseClass = null, fixedDORepoConfig, namespaceBinding } = props;

  // 2 — accept the database, current schema, and bootstrap marker state
  const initializeSchema = Effect.fn('FixedDORepo.initializeSchema')(
    function* (props: {
      db: IDb<CONFIG>;
      schema: IDbConfigSchema<CONFIG>;
      isBootstrapped: boolean;
    }) {
      const { db, isBootstrapped, schema } = props;

      // 3 — return immediately when the marker is already present
      if (isBootstrapped) {
        return;
      }

      // 4 — let provisioning fail before makeDORepo can mark bootstrap complete
      yield* provisionDb({ db, schema });
    },
  );

  // 5 — pass initializeSchema alongside the fixed configuration
  const FixedDORepoBase = makeDORepo({
    baseClass,
    namespaceBinding,
    ...fixedDORepoConfig,
    initializeSchema,
  });

  // 6 — retain static fixedDORepoConfig; startup and readiness belong to makeDORepo
  return class FixedDORepo extends FixedDORepoBase {
    static readonly fixedDORepoConfig = fixedDORepoConfig;
  };
}
