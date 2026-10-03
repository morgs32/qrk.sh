import type { MatchParams } from '@remix-run/route-pattern/match';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import type {
  IDb,
  IDbConfig,
  IDbConfigRelations,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import type { IRepoTableData } from '@zerospin/core/system/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { env, type DurableObject } from 'cloudflare:workers';
import config from 'config';
import { getTableName } from 'drizzle-orm';
import { Effect } from 'effect';

import type { AggregateActorVersionChain } from '../AggregateActorVersionChain/AggregateActorVersionChain.js';
import type { AggregateActorVersionRepo } from '../AggregateActorVersionRepo/AggregateActorVersionRepo.js';
import type { AggregateChain } from '../AggregateChain/AggregateChain.js';
import type { AggregateVersionChain } from '../AggregateVersionChain/AggregateVersionChain.js';
import type { AggregateVersionRepo } from '../AggregateVersionRepo/AggregateVersionRepo.js';
import { getSystemSpec } from '../getSystemSpec/getSystemSpec.js';
import type { IAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';
import { makeDORepo } from '../makeDORepo/makeDORepo.js';
import type { ServiceActorVersionChain } from '../ServiceActorVersionChain/ServiceActorVersionChain.js';
import type { ServiceActorVersionRepo } from '../ServiceActorVersionRepo/ServiceActorVersionRepo.js';
import type { ServiceChain } from '../ServiceChain/ServiceChain.js';
import type { ServiceVersionChain } from '../ServiceVersionChain/ServiceVersionChain.js';
import type { ServiceVersionRepo } from '../ServiceVersionRepo/ServiceVersionRepo.js';
import type { SystemLogAgent } from '../SystemLogAgent/SystemLogAgent.js';
import type { SystemLogRepo } from '../SystemLogRepo/SystemLogRepo.js';
import type { SystemRepo } from '../SystemRepo/SystemRepo.js';

import type { IFixedDORepoConfig } from './types.js';

const { system } = config;

/** Namespace names stay explicit so deriving the base never inspects its subclasses. */
declare global {
  namespace Cloudflare {
    interface DORepoNamespaces {
      SYSTEM_REPO: {
        getByName(
          name: string,
          options?: DurableObjectNamespaceGetDurableObjectOptions,
        ): Pick<
          SystemRepo,
          | 'initialize'
          | 'checkSystemSpec'
          | 'createAggregateSessionWebSocketTicket'
          | 'consumeAggregateSessionWebSocketTicket'
          | 'createServiceSessionWebSocketTicket'
          | 'consumeServiceSessionWebSocketTicket'
          | 'registerRepo'
          | 'registerRepos'
          | 'getRepoRegistrations'
          | 'getRepoTableRows'
        >;
      };
      AGGREGATE_VERSION_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & AggregateVersionRepo
      >;
      SERVICE_VERSION_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & ServiceVersionRepo
      >;
      AGGREGATE_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & AggregateChain
      >;
      AGGREGATE_VERSION_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & AggregateVersionChain
      >;
      SERVICE_VERSION_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & ServiceVersionChain
      >;
      AGGREGATE_ACTOR_VERSION_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & AggregateActorVersionRepo
      >;
      AGGREGATE_ACTOR_VERSION_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & AggregateActorVersionChain
      >;
      SERVICE_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & ServiceChain
      >;
      SERVICE_ACTOR_VERSION_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & ServiceActorVersionRepo
      >;
      SERVICE_ACTOR_VERSION_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & ServiceActorVersionChain
      >;
      SYSTEM_LOG_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & SystemLogRepo
      >;
      SYSTEM_LOG_AGENT: DurableObjectNamespace<
        Rpc.DurableObjectBranded & SystemLogAgent
      >;
    }
  }
}

/** Path-named Durable Object Repo with provision-once schema and bootstrap lifecycle. */
/*
 * Production Repo classes use this provision-once schema lifecycle.
 * makeDORepo owns name parsing and bootstrap marking. This factory supplies
 * system key validation and admission, then skips schema work on activations
 * whose successful bootstrap marker is retained.
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
    onDOActivation(): Effect.Effect<
      void,
      IAnyError | IZerospinErrorJson,
      SERVICES | Async
    >;
    ready(): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
    getRepoTableRows(props: {
      tableName: string;
    }): Promise<IRpcEnvelope<IRepoTableData, IZerospinErrorJson>>;
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

  // 5 — supply system validation and admission alongside the fixed schema policy
  const { repoType } = fixedDORepoConfig;
  const FixedDORepoBase = makeDORepo({
    baseClass,
    namespaceBinding,
    ...fixedDORepoConfig,
    initializeSchema,
    validateKey: Effect.fn('FixedDORepo.validateKey')(function* (props: {
      key: MatchParams<PATTERN>;
    }) {
      const { key } = props;
      if (
        'aggregateVersion' in key &&
        'aggregateName' in key &&
        typeof key.aggregateVersion === 'string' &&
        typeof key.aggregateName === 'string'
      ) {
        if (
          !Object.hasOwn(
            system.aggregates[key.aggregateName] ?? {},
            key.aggregateVersion,
          )
        ) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'aggregate-version-unavailable',
              message: 'Aggregate version is not listed in this deployment',
            }),
          );
        }
      }
      if (
        'serviceVersion' in key &&
        'serviceName' in key &&
        typeof key.serviceVersion === 'string' &&
        typeof key.serviceName === 'string'
      ) {
        if (
          !Object.hasOwn(
            system.services[key.serviceName] ?? {},
            key.serviceVersion,
          )
        ) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'service-version-unavailable',
              message: 'Service version is not listed in this deployment',
            }),
          );
        }
      }
    }),
    registerRepo: Effect.fn('FixedDORepo.registerRepo')(function* (props: {
      name: string;
      schema: IDbConfigSchema<CONFIG>;
    }) {
      const { name, schema } = props;
      // SystemRepo's fixed config omits repoType to avoid self-registration.
      if (repoType === undefined) {
        return;
      }
      const spec = yield* getSystemSpec();
      yield* makeAsync<IRpcEnvelope<void, IZerospinErrorJson>>(() =>
        env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID).registerRepo({
          spec,
          registration: {
            repoType,
            repoName: name,
            tableNames: Object.values(schema).map(getTableName),
          },
        }),
      ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
    }),
  });

  // 6 — retain static fixedDORepoConfig; startup and readiness belong to makeDORepo
  return class FixedDORepo extends FixedDORepoBase {
    static readonly fixedDORepoConfig = fixedDORepoConfig;
  };
}
