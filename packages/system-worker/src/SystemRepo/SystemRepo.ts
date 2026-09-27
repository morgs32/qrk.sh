import { RoutePattern } from '@remix-run/route-pattern';
import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
/*
 * System-worker annotation:
 * Defines the static SystemRepo Durable Object shell and local storage wiring.
 * Public RPC methods delegate to same-named Effect functions in method folders.
 */
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import type {
  IRepoRegistration,
  IRepoType,
  ISystemSpec,
} from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import {
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
} from '@zerospin/error';
import { makeRpcEnvelope } from '@zerospin/logger';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import config from 'config';
import { getTableColumns } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import invariant from 'tiny-invariant';

import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';

import { checkSystemSpec } from './checkSystemSpec/checkSystemSpec.js';
import { consumeAggregateSessionWebSocketTicket } from './consumeAggregateSessionWebSocketTicket/consumeAggregateSessionWebSocketTicket.js';
import { consumeServiceSessionWebSocketTicket } from './consumeServiceSessionWebSocketTicket/consumeServiceSessionWebSocketTicket.js';
import { createAggregateSessionWebSocketTicket } from './createAggregateSessionWebSocketTicket/createAggregateSessionWebSocketTicket.js';
import { createServiceSessionWebSocketTicket } from './createServiceSessionWebSocketTicket/createServiceSessionWebSocketTicket.js';
import { fetch } from './fetch/fetch.js';
import { getRepoRegistrations } from './getRepoRegistrations/getRepoRegistrations.js';
import { initialize } from './initialize/initialize.js';
import { registerRepo } from './registerRepo/registerRepo.js';
import { registerRepos } from './registerRepos/registerRepos.js';
import { systemRepoDbConfig } from './systemRepoDbConfig.js';

export class SystemRepo extends makeFixedDORepo({
  namespaceBinding: 'SYSTEM_REPO',
  fixedDORepoConfig: makeFixedDORepoConfig({
    abbreviation: undefined,
    namePattern: RoutePattern.parse('/:systemId'),
    managedRuntime: config.system.runtime,
    dbConfig: systemRepoDbConfig,
  }),
}) {
  /** Require the configured singleton identity before common Repo initialization. */
  constructor(ctx: DurableObjectState, workerEnv: Cloudflare.Env) {
    invariant(
      ctx.id.name === workerEnv.ZEROSPIN_SYSTEM_ID,
      'SystemRepo must be addressed by the exact systemId',
    );
    Schema.decodeUnknownSync(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(workerEnv.ZEROSPIN_SYSTEM_ID);
    // Rename retained locks before the common base can provision or check specs.
    // One transaction covers both kinds, including rollback on ambiguous state.
    ctx.storage.transactionSync(() => {
      for (const [oldName, newName] of [
        ['aggregateSpecLocks', 'lockedAggregateVersions'],
        ['serviceSpecLocks', 'lockedServiceVersions'],
      ]) {
        const oldExists =
          ctx.storage.sql
            .exec(
              'SELECT name FROM sqlite_master WHERE type = ? AND name = ?',
              'table',
              oldName,
            )
            .toArray().length > 0;
        const newExists =
          ctx.storage.sql
            .exec(
              'SELECT name FROM sqlite_master WHERE type = ? AND name = ?',
              'table',
              newName,
            )
            .toArray().length > 0;
        if (oldExists && newExists) {
          throw makeZerospinError({
            code: 'system-spec-lock-migration-conflict',
            message: `Cannot migrate ${oldName}: both ${oldName} and ${newName} exist`,
          });
        }
        if (oldExists) {
          ctx.storage.sql.exec(
            `ALTER TABLE "${oldName}" RENAME TO "${newName}"`,
          );
          ctx.storage.sql.exec(
            `CREATE UNIQUE INDEX "${newName}_name_version_unique" ON "${newName}" ("name", "version")`,
          );
          ctx.storage.sql.exec(
            `DROP INDEX IF EXISTS "${oldName}_name_version_unique"`,
          );
        }
      }
    });
    super(ctx, workerEnv);
  }

  /*
   * Entrypoint WebSocket requests reach the singleton SystemRepo router.
   * Session upgrades spend a retained ticket before forwarding to its log, while
   * the system-log route delegates directly to SystemLogAgent.
   *
   * 1. Run the named HTTP routing Effect.
   * 2. Encode domain failures as uncached JSON responses.
   * 3. Handle rejected runtime promises.
   */
  fetch(request: Request): Promise<Response> {
    // 1 — bind singleton identity and ticket tables after the common activation gate
    return (
      config.system.runtime
        .runPromise(
          fetch({
            db: this.db,
            systemId: this.key.systemId,
            request,
            aggregateSessionWebSocketTicketTable:
              systemRepoDbConfig.schema.aggregateSessionWebSocketTickets,
            aggregateSessionWebSocketTicketColumns: getTableColumns(
              systemRepoDbConfig.schema.aggregateSessionWebSocketTickets,
            ),
            serviceSessionWebSocketTicketTable:
              systemRepoDbConfig.schema.serviceSessionWebSocketTickets,
            serviceSessionWebSocketTicketColumns: getTableColumns(
              systemRepoDbConfig.schema.serviceSessionWebSocketTickets,
            ),
          }).pipe(
            // 2 — retain the domain status or default to HTTP 500
            Effect.catch(failure =>
              Effect.succeed(
                Response.json(
                  {
                    cause: failure.cause,
                    code: failure.code,
                    extra: failure.extra,
                    message: failure.message,
                    status: failure.status,
                  },
                  {
                    status: failure.status ?? 500,
                    headers: { 'Cache-Control': 'no-store' },
                  },
                ),
              ),
            ),
          ),
        )

        // 3 — wrap unexpected failures as system-fetch-failed and return no-store JSON
        .catch(error => {
          const failure = isZerospinError(error)
            ? error
            : makeZerospinError({
                code: 'system-fetch-failed',
                message: 'SystemRepo request failed',
                cause: prettyUnknownFailure(error),
                status: 500,
              });
          return Response.json(
            {
              cause: failure.cause,
              code: failure.code,
              extra: failure.extra,
              message: failure.message,
              status: failure.status,
            },
            {
              status: failure.status ?? 500,
              headers: { 'Cache-Control': 'no-store' },
            },
          );
        })
    );
  }

  /*
   * Explicit initialization awaits authored service-chain readiness.
   *
   * 1. Run the bound domain operation.
   */
  initialize() {
    // 1 — run initialize with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      initialize({
        serviceChains: this.env.SERVICE_CHAIN,
        systemId: this.key.systemId,
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }

  /*
   * SystemRepo mints a single-use ticket for a preselected aggregate definition
   * log and lock. Only the ticket hash is retained; the raw random credential
   * is returned once for the subsequent WebSocket upgrade.
   *
   * 1. Run the bound domain operation.
   */
  createAggregateSessionWebSocketTicket(props: {
    repoName: string;
    aggregateId: IAggregateId;
    aggregateName: string;
    aggregateVersion: string;
    actorName: string;
    actorVersion: string;
    actorPath: string;
    identity: Readonly<Record<string, unknown>>;
    sessionName: string;
    aggregateSessionLock: IAggregateSessionLock;
  }) {
    // 1 — run createAggregateSessionWebSocketTicket with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      createAggregateSessionWebSocketTicket({
        db: this.db,
        ...props,
        aggregateSessionWebSocketTicketTable:
          systemRepoDbConfig.schema.aggregateSessionWebSocketTickets,
        aggregateSessionWebSocketTicketColumns: getTableColumns(
          systemRepoDbConfig.schema.aggregateSessionWebSocketTickets,
        ),
      }).pipe(makeRpcEnvelope),
    );
  }

  /*
   * SystemRepo spends the aggregate definition ticket during WebSocket upgrade.
   * DELETE RETURNING makes consumption single-use before stored-row validation
   * and expiry checks finish.
   *
   * 1. Run the bound domain operation.
   */
  consumeAggregateSessionWebSocketTicket(props: { ticket: string }) {
    const { ticket } = props;

    // 1 — run consumeAggregateSessionWebSocketTicket with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      consumeAggregateSessionWebSocketTicket({
        db: this.db,
        ticket,
        aggregateSessionWebSocketTicketTable:
          systemRepoDbConfig.schema.aggregateSessionWebSocketTickets,
        aggregateSessionWebSocketTicketColumns: getTableColumns(
          systemRepoDbConfig.schema.aggregateSessionWebSocketTickets,
        ),
      }).pipe(makeRpcEnvelope),
    );
  }

  /*
   * SystemRepo mints a single-use ticket for a preselected service definition
   * log and lock. Only the ticket hash is retained; the raw random credential
   * is returned once for the subsequent WebSocket upgrade.
   *
   * 1. Run the bound domain operation.
   */
  createServiceSessionWebSocketTicket(props: {
    repoName: string;
    serviceName: string;
    serviceVersion: string;
    actorPath: string;
    identity: Readonly<Record<string, unknown>>;
    sessionName: string;
    serviceSessionLock: IServiceSessionLock;
  }) {
    // 1 — run createServiceSessionWebSocketTicket with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      createServiceSessionWebSocketTicket({
        db: this.db,
        ...props,
        serviceSessionWebSocketTicketTable:
          systemRepoDbConfig.schema.serviceSessionWebSocketTickets,
        serviceSessionWebSocketTicketColumns: getTableColumns(
          systemRepoDbConfig.schema.serviceSessionWebSocketTickets,
        ),
      }).pipe(makeRpcEnvelope),
    );
  }

  /*
   * SystemRepo spends the service definition ticket during WebSocket upgrade.
   * DELETE RETURNING makes consumption single-use before stored-row validation
   * and expiry checks finish.
   *
   * 1. Run the bound domain operation.
   */
  consumeServiceSessionWebSocketTicket(props: { ticket: string }) {
    const { ticket } = props;

    // 1 — run consumeServiceSessionWebSocketTicket with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      consumeServiceSessionWebSocketTicket({
        db: this.db,
        ticket,
        serviceSessionWebSocketTicketTable:
          systemRepoDbConfig.schema.serviceSessionWebSocketTickets,
        serviceSessionWebSocketTicketColumns: getTableColumns(
          systemRepoDbConfig.schema.serviceSessionWebSocketTickets,
        ),
      }).pipe(makeRpcEnvelope),
    );
  }

  /** Lock all candidate definitions supplied by the executing Worker in one transaction. */
  checkSystemSpec(props: { spec: ISystemSpec }) {
    return config.system.runtime.runPromise(
      checkSystemSpec({ db: this.db, spec: props.spec }).pipe(makeRpcEnvelope),
    );
  }

  /*
   * Repo startup requires accepted definitions before recording its physical instance and table names in SystemRepo.
   * A repeated registration updates table metadata for the same repoType/repoName.
   *
   * 1. Run the bound domain operation.
   */
  registerRepo(props: { registration: IRepoRegistration; spec: ISystemSpec }) {
    const { registration, spec } = props;

    // 1 — run registerRepo with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      registerRepo({
        spec,
        db: this.db,
        repoTable: systemRepoDbConfig.schema.repos,
        registration,
      }).pipe(makeRpcEnvelope),
    );
  }

  /*
   * Session initialization registers its projection and retained output log
   * as one catalog transaction. The pair must belong to the same aggregate or
   * service definition topology.
   *
   * 1. Run the bound domain operation.
   */
  registerRepos(props: {
    spec: ISystemSpec;
    sessionRepo: {
      repoType: 'AggregateActorVersionRepo' | 'ServiceActorVersionRepo';
      repoName: string;
      tableNames: readonly string[];
    };
    finalizedCommandChain: {
      repoType: 'AggregateActorVersionChain' | 'ServiceActorVersionChain';
      repoName: string;
      tableNames: readonly string[];
    };
  }) {
    const { finalizedCommandChain, sessionRepo, spec } = props;

    // 1 — run registerRepos with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      registerRepos({
        spec,
        db: this.db,
        repoTable: systemRepoDbConfig.schema.repos,
        sessionRepo,
        finalizedCommandChain,
      }).pipe(makeRpcEnvelope),
    );
  }

  /*
   * Secret-key inspection reads one concrete Repo kind from the singleton
   * SystemRepo catalog. This reader validates registration rows and decodes
   * each stored table-name array before returning it.
   *
   * 1. Run the bound domain operation.
   */
  getRepoRegistrations(props: { repoType: IRepoType }) {
    const { repoType } = props;

    // 1 — run getRepoRegistrations with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      getRepoRegistrations({
        db: this.db,
        repoTable: systemRepoDbConfig.schema.repos,
        repoType,
        systemId: this.key.systemId,
      }).pipe(makeRpcEnvelope),
    );
  }
}
