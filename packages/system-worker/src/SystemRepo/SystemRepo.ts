/*
 * System-worker annotation:
 * Defines the static SystemRepo Durable Object shell and local storage wiring.
 * Public RPC methods delegate to same-named Effect functions in method folders.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import type {
  IRepoRegistration,
  IRepoType,
  ISystemSpec,
} from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { getTableColumns } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import invariant from 'tiny-invariant';

import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';

import { checkSystemSpec } from './checkSystemSpec/checkSystemSpec.js';
import { consumeAggregateFrontendWebSocketTicket } from './consumeAggregateFrontendWebSocketTicket/consumeAggregateFrontendWebSocketTicket.js';
import { consumeServiceFrontendWebSocketTicket } from './consumeServiceFrontendWebSocketTicket/consumeServiceFrontendWebSocketTicket.js';
import { createAggregateFrontendWebSocketTicket } from './createAggregateFrontendWebSocketTicket/createAggregateFrontendWebSocketTicket.js';
import { createServiceFrontendWebSocketTicket } from './createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.js';
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
    managedRuntime,
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
    super(ctx, workerEnv);
  }

  /*
   * Entrypoint WebSocket requests reach the singleton SystemRepo router.
   * Frontend upgrades spend a retained ticket before forwarding to its log, while
   * the system-log route delegates directly to SystemLogAgent.
   *
   * 1. Run the named HTTP routing Effect.
   * 2. Encode domain failures as uncached JSON responses.
   * 3. Handle rejected runtime promises.
   */
  fetch(request: Request): Promise<Response> {
    // 1 — bind singleton identity and ticket tables after the common activation gate
    return (
      managedRuntime
        .runPromise(
          fetch({
            db: this.db,
            systemId: this.key.systemId,
            request,
            aggregateFrontendWebSocketTicketTable:
              systemRepoDbConfig.schema.aggregateFrontendWebSocketTickets,
            aggregateFrontendWebSocketTicketColumns: getTableColumns(
              systemRepoDbConfig.schema.aggregateFrontendWebSocketTickets,
            ),
            serviceFrontendWebSocketTicketTable:
              systemRepoDbConfig.schema.serviceFrontendWebSocketTickets,
            serviceFrontendWebSocketTicketColumns: getTableColumns(
              systemRepoDbConfig.schema.serviceFrontendWebSocketTickets,
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
                    message: failure.rawMessage,
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
          const failure = ZerospinError.isZerospinError(error)
            ? error
            : new ZerospinError({
                code: 'system-fetch-failed',
                message: 'SystemRepo request failed',
                cause: ZerospinError.prettyUnknownFailure(error),
                status: 500,
              });
          return Response.json(
            {
              cause: failure.cause,
              code: failure.code,
              extra: failure.extra,
              message: failure.rawMessage,
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
  initialize(): Promise<IEncodedResult<void, IAnyErrorJson>> {
    // 1 — run initialize with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      initialize({
        serviceAdmittedChains: this.env.SERVICE_ADMITTED_CHAIN,
        systemId: this.key.systemId,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  /*
   * SystemRepo mints a single-use ticket for a preselected aggregate frontend
   * log and lock. Only the ticket hash is retained; the raw random credential
   * is returned once for the subsequent WebSocket upgrade.
   *
   * 1. Run the bound domain operation.
   */
  createAggregateFrontendWebSocketTicket(props: {
    repoName: string;
    aggregateId: IAggregateId;
    aggregateName: string;
    aggregateVersion: string;
    userId: string;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  }) {
    // 1 — run createAggregateFrontendWebSocketTicket with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      createAggregateFrontendWebSocketTicket({
        db: this.db,
        ...props,
        aggregateFrontendWebSocketTicketTable:
          systemRepoDbConfig.schema.aggregateFrontendWebSocketTickets,
        aggregateFrontendWebSocketTicketColumns: getTableColumns(
          systemRepoDbConfig.schema.aggregateFrontendWebSocketTickets,
        ),
      }).pipe(encodeRpc),
    );
  }

  /*
   * SystemRepo spends the aggregate frontend ticket during WebSocket upgrade.
   * DELETE RETURNING makes consumption single-use before stored-row validation
   * and expiry checks finish.
   *
   * 1. Run the bound domain operation.
   */
  consumeAggregateFrontendWebSocketTicket(props: { ticket: string }) {
    const { ticket } = props;

    // 1 — run consumeAggregateFrontendWebSocketTicket with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      consumeAggregateFrontendWebSocketTicket({
        db: this.db,
        ticket,
        aggregateFrontendWebSocketTicketTable:
          systemRepoDbConfig.schema.aggregateFrontendWebSocketTickets,
        aggregateFrontendWebSocketTicketColumns: getTableColumns(
          systemRepoDbConfig.schema.aggregateFrontendWebSocketTickets,
        ),
      }).pipe(encodeRpc),
    );
  }

  /*
   * SystemRepo mints a single-use ticket for a preselected service frontend
   * log and lock. Only the ticket hash is retained; the raw random credential
   * is returned once for the subsequent WebSocket upgrade.
   *
   * 1. Run the bound domain operation.
   */
  createServiceFrontendWebSocketTicket(props: {
    repoName: string;
    serviceName: string;
    serviceVersion: string;
    userId: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  }): Promise<IEncodedResult<string, IAnyErrorJson>> {
    // 1 — run createServiceFrontendWebSocketTicket with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      createServiceFrontendWebSocketTicket({
        db: this.db,
        ...props,
        serviceFrontendWebSocketTicketTable:
          systemRepoDbConfig.schema.serviceFrontendWebSocketTickets,
        serviceFrontendWebSocketTicketColumns: getTableColumns(
          systemRepoDbConfig.schema.serviceFrontendWebSocketTickets,
        ),
      }).pipe(encodeRpc),
    );
  }

  /*
   * SystemRepo spends the service frontend ticket during WebSocket upgrade.
   * DELETE RETURNING makes consumption single-use before stored-row validation
   * and expiry checks finish.
   *
   * 1. Run the bound domain operation.
   */
  consumeServiceFrontendWebSocketTicket(props: { ticket: string }) {
    const { ticket } = props;

    // 1 — run consumeServiceFrontendWebSocketTicket with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      consumeServiceFrontendWebSocketTicket({
        db: this.db,
        ticket,
        serviceFrontendWebSocketTicketTable:
          systemRepoDbConfig.schema.serviceFrontendWebSocketTickets,
        serviceFrontendWebSocketTicketColumns: getTableColumns(
          systemRepoDbConfig.schema.serviceFrontendWebSocketTickets,
        ),
      }).pipe(encodeRpc),
    );
  }

  /** Lock all candidate definitions supplied by the executing Worker in one transaction. */
  checkSystemSpec(props: {
    spec: ISystemSpec;
  }): Promise<
    IEncodedResult<{ workerVersionId: string | null }, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      checkSystemSpec({ db: this.db, spec: props.spec }).pipe(encodeRpc),
    );
  }

  /*
   * Repo startup requires accepted definitions before recording its physical instance and table names in SystemRepo.
   * A repeated registration updates table metadata for the same repoType/repoName.
   *
   * 1. Run the bound domain operation.
   */
  registerRepo(props: {
    registration: IRepoRegistration;
    spec: ISystemSpec;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    const { registration } = props;

    // 1 — run registerRepo with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      registerRepo({
        spec: props.spec,
        db: this.db,
        repoTable: systemRepoDbConfig.schema.repos,
        registration,
      }).pipe(encodeRpc),
    );
  }

  /*
   * Frontend initialization registers its projection and retained output log
   * as one catalog transaction. The pair must belong to the same aggregate or
   * service frontend topology.
   *
   * 1. Run the bound domain operation.
   */
  registerRepos(props: {
    spec: ISystemSpec;
    frontendRepo: {
      repoType: 'UserVersionedAggregateRepo' | 'FrontendVersionedServiceRepo';
      repoName: string;
      tableNames: readonly string[];
    };
    finalizedCommandChain: {
      repoType: 'UserVersionedAggregateChain' | 'FrontendServiceChain';
      repoName: string;
      tableNames: readonly string[];
    };
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    const { finalizedCommandChain, frontendRepo } = props;

    // 1 — run registerRepos with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      registerRepos({
        spec: props.spec,
        db: this.db,
        repoTable: systemRepoDbConfig.schema.repos,
        frontendRepo,
        finalizedCommandChain,
      }).pipe(encodeRpc),
    );
  }

  /*
   * Secret-key inspection reads one concrete Repo kind from the singleton
   * SystemRepo catalog. This reader validates registration rows and decodes
   * each stored table-name array before returning it.
   *
   * 1. Run the bound domain operation.
   */
  getRepoRegistrations(props: {
    repoType: IRepoType;
  }): Promise<IEncodedResult<readonly IRepoRegistration[], IAnyErrorJson>> {
    const { repoType } = props;

    // 1 — run getRepoRegistrations with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      getRepoRegistrations({
        db: this.db,
        repoTable: systemRepoDbConfig.schema.repos,
        repoType,
        systemId: this.key.systemId,
      }).pipe(encodeRpc),
    );
  }
}
