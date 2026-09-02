/*
 * System-worker annotation:
 * Defines the static SystemRepo Durable Object shell and local storage wiring.
 * Public RPC methods delegate to same-named Effect functions in method folders.
 */

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import type {
  IRepoRegistration,
  IRepoTableData,
  IRepoType,
  ISystemId,
} from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import {
  makeAbbreviationIdSchema,
  type InferIdFromAbbreviation,
} from '@zerospin/schema';
import { DurableObject, env } from 'cloudflare:workers';
import { getTableColumns } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import invariant from 'tiny-invariant';

import {
  makeSystemRuntime,
  type ISystemRuntime,
} from '../makeSystemRuntime.js';
import { managedRuntime } from '../managedRuntime.js';

import { consumeAggregateFrontendWebSocketTicket } from './consumeAggregateFrontendWebSocketTicket/consumeAggregateFrontendWebSocketTicket.js';
import { consumeServiceFrontendWebSocketTicket } from './consumeServiceFrontendWebSocketTicket/consumeServiceFrontendWebSocketTicket.js';
import { createAggregateFrontendWebSocketTicket } from './createAggregateFrontendWebSocketTicket/createAggregateFrontendWebSocketTicket.js';
import { createServiceFrontendWebSocketTicket } from './createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.js';
import { fetch } from './fetch/fetch.js';
import { getAggregateIds } from './getAggregateIds/getAggregateIds.js';
import { getRepoRegistrations } from './getRepoRegistrations/getRepoRegistrations.js';
import { getRepoTableRows } from './getRepoTableRows/getRepoTableRows.js';
import { initializeSystemRepo } from './initializeSystemRepo.js';
import { registerRepo } from './registerRepo/registerRepo.js';
import { registerRepos } from './registerRepos/registerRepos.js';
import {
  systemRepoDbConfig,
  systemRepoDrizzleSchemas,
} from './SystemRepoDbConfig.js';
import { upsertAggregate } from './upsertAggregate/upsertAggregate.js';

export class SystemRepo extends DurableObject {
  static getRepo(props: {
    systemId: string;
  }): Pick<
    SystemRepo,
    | 'getAggregateIds'
    | 'createAggregateFrontendWebSocketTicket'
    | 'consumeAggregateFrontendWebSocketTicket'
    | 'createServiceFrontendWebSocketTicket'
    | 'consumeServiceFrontendWebSocketTicket'
    | 'upsertAggregate'
    | 'registerRepo'
    | 'registerRepos'
    | 'getRepoRegistrations'
    | 'getRepoTableRows'
  > {
    return env.SYSTEM_REPO.getByName(
      Schema.decodeUnknownSync(
        makeAbbreviationIdSchema(coreAbbreviations.system),
      )(props.systemId),
    );
  }

  readonly #db: IDb<typeof systemRepoDbConfig>;
  readonly #readiness: Promise<void>;
  readonly #runtime: ISystemRuntime;
  readonly #systemId: ISystemId;

  constructor(ctx: DurableObjectState, workerEnv: Cloudflare.Env) {
    super(ctx, workerEnv);
    invariant(
      ctx.id.name === workerEnv.ZEROSPIN_SYSTEM_ID,
      'SystemRepo must be addressed by the exact systemId',
    );
    this.#systemId = Schema.decodeUnknownSync(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(workerEnv.ZEROSPIN_SYSTEM_ID);
    this.#runtime = makeSystemRuntime();

    const { db } = managedRuntime.runSync(
      initializeSystemRepo({
        storage: ctx.storage,
        dbConfig: systemRepoDbConfig,
      }).pipe(Effect.provide(AsyncLive)),
    );
    this.#db = db;
    this.#readiness = ctx.blockConcurrencyWhile(() =>
      managedRuntime.runPromise(
        Effect.gen(function* () {
          if (ctx.storage.kv.get('_isBootstrapped') === 'true') {
            return;
          }

          yield* provisionDb({
            db,
            schema: systemRepoDrizzleSchemas,
          });
          ctx.storage.kv.put('_isBootstrapped', 'true');
        }).pipe(Effect.provide(AsyncLive)),
      ),
    );
    void this.#readiness.catch(() => undefined);
  }

  override fetch(request: Request): Promise<Response> {
    return this.#runtime
      .runPromise(
        fetch({
          db: this.#db,
          systemId: this.#systemId,
          request,
          readiness: this.#readiness,
          aggregateFrontendWebSocketTicketTable:
            systemRepoDrizzleSchemas.aggregateFrontendWebSocketTickets,
          aggregateFrontendWebSocketTicketColumns: getTableColumns(
            systemRepoDrizzleSchemas.aggregateFrontendWebSocketTickets,
          ),
          serviceFrontendWebSocketTicketTable:
            systemRepoDrizzleSchemas.serviceFrontendWebSocketTickets,
          serviceFrontendWebSocketTicketColumns: getTableColumns(
            systemRepoDrizzleSchemas.serviceFrontendWebSocketTickets,
          ),
        }).pipe(
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
      });
  }

  getAggregateIds(): Promise<
    IEncodedResult<readonly InferIdFromAbbreviation[], IAnyErrorJson>
  > {
    return this.#runtime.runPromise(
      getAggregateIds({
        db: this.#db,
        aggregateTable: systemRepoDrizzleSchemas.aggregates,
      }).pipe(encodeRpc),
    );
  }

  createAggregateFrontendWebSocketTicket(props: {
    repoName: string;
    aggregateId: IAggregateId;
    aggregateName: string;
    userId: string;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  }) {
    return this.#runtime.runPromise(
      createAggregateFrontendWebSocketTicket({
        db: this.#db,
        ...props,
        aggregateFrontendWebSocketTicketTable:
          systemRepoDrizzleSchemas.aggregateFrontendWebSocketTickets,
        aggregateFrontendWebSocketTicketColumns: getTableColumns(
          systemRepoDrizzleSchemas.aggregateFrontendWebSocketTickets,
        ),
      }).pipe(encodeRpc),
    );
  }

  consumeAggregateFrontendWebSocketTicket(props: { ticket: string }) {
    return this.#runtime.runPromise(
      consumeAggregateFrontendWebSocketTicket({
        db: this.#db,
        ticket: props.ticket,
        aggregateFrontendWebSocketTicketTable:
          systemRepoDrizzleSchemas.aggregateFrontendWebSocketTickets,
        aggregateFrontendWebSocketTicketColumns: getTableColumns(
          systemRepoDrizzleSchemas.aggregateFrontendWebSocketTickets,
        ),
      }).pipe(encodeRpc),
    );
  }

  createServiceFrontendWebSocketTicket(props: {
    repoName: string;
    serviceName: string;
    userId: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  }): Promise<IEncodedResult<string, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      createServiceFrontendWebSocketTicket({
        db: this.#db,
        ...props,
        serviceFrontendWebSocketTicketTable:
          systemRepoDrizzleSchemas.serviceFrontendWebSocketTickets,
        serviceFrontendWebSocketTicketColumns: getTableColumns(
          systemRepoDrizzleSchemas.serviceFrontendWebSocketTickets,
        ),
      }).pipe(encodeRpc),
    );
  }

  consumeServiceFrontendWebSocketTicket(props: { ticket: string }) {
    return this.#runtime.runPromise(
      consumeServiceFrontendWebSocketTicket({
        db: this.#db,
        ticket: props.ticket,
        serviceFrontendWebSocketTicketTable:
          systemRepoDrizzleSchemas.serviceFrontendWebSocketTickets,
        serviceFrontendWebSocketTicketColumns: getTableColumns(
          systemRepoDrizzleSchemas.serviceFrontendWebSocketTickets,
        ),
      }).pipe(encodeRpc),
    );
  }

  upsertAggregate(props: {
    aggregateId: string;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      upsertAggregate({
        db: this.#db,
        aggregateTable: systemRepoDrizzleSchemas.aggregates,
        aggregateId: props.aggregateId,
      }).pipe(encodeRpc),
    );
  }

  registerRepo(props: {
    registration: IRepoRegistration;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      registerRepo({
        db: this.#db,
        repoTable: systemRepoDrizzleSchemas.repos,
        registration: props.registration,
      }).pipe(encodeRpc),
    );
  }

  registerRepos(props: {
    frontendRepo: {
      repoType:
        | 'MaterializedAggregateFrontendRepo'
        | 'MaterializedServiceFrontendRepo';
      repoName: string;
      tableNames: readonly string[];
    };
    finalizedCommandChain: {
      repoType:
        | 'AggregateFrontendFinalizedCommandChain'
        | 'ServiceFrontendFinalizedCommandChain';
      repoName: string;
      tableNames: readonly string[];
    };
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      registerRepos({
        db: this.#db,
        repoTable: systemRepoDrizzleSchemas.repos,
        frontendRepo: props.frontendRepo,
        finalizedCommandChain: props.finalizedCommandChain,
      }).pipe(encodeRpc),
    );
  }

  getRepoRegistrations(props: {
    repoType: IRepoType;
  }): Promise<IEncodedResult<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getRepoRegistrations({
        db: this.#db,
        repoTable: systemRepoDrizzleSchemas.repos,
        repoType: props.repoType,
      }).pipe(encodeRpc),
    );
  }

  getRepoTableRows(props: {
    tableName: string;
  }): Promise<IEncodedResult<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getRepoTableRows({
        db: this.#db,
        schema: systemRepoDbConfig.schema,
        tableName: props.tableName,
      }).pipe(encodeRpc),
    );
  }
}
