/*
 * System-worker annotation:
 * Defines the SystemRepo Durable Object shell and local storage wiring.
 * Public RPC/lifecycle methods should delegate to same-named Effect functions instead of growing inline workflow bodies here.
 */

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { IDeploySeedCommand } from '@zerospin/core/contracts/types';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type {
  IAccountId,
  IActorId,
  IAnyTables,
  InferIdFromAbbreviation,
} from '@zerospin/core/models/types';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type {
  IRepoRegistration,
  IRepoTableData,
  IRepoType,
  ISystemSpec,
} from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { type IAnyErrorJson } from '@zerospin/error';
import { DurableObject, env } from 'cloudflare:workers';
import { getTableColumns } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import invariant from 'tiny-invariant';

import { getRepoTableRows } from '../getRepoTableRows/getRepoTableRows.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { assertGenerationAdmission } from './assertGenerationAdmission/assertGenerationAdmission.js';
import { consumeFrontendWebSocketTicket } from './consumeFrontendWebSocketTicket/consumeFrontendWebSocketTicket.js';
import { consumeServiceFrontendWebSocketTicket } from './consumeServiceFrontendWebSocketTicket/consumeServiceFrontendWebSocketTicket.js';
import { createFrontendWebSocketTicket } from './createFrontendWebSocketTicket/createFrontendWebSocketTicket.js';
import { createServiceFrontendWebSocketTicket } from './createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { getAccountIds } from './getAccountIds/getAccountIds.js';
import { getGenerationState } from './getGenerationState/getGenerationState.js';
import { getRepoRegistrations } from './getRepoRegistrations/getRepoRegistrations.js';
import { initializeSystemRepo } from './initializeSystemRepo.js';
import { migrateSystemRepo } from './migrateSystemRepo.js';
import { openGeneration } from './openGeneration/openGeneration.js';
import { prepareGeneration } from './prepareGeneration/prepareGeneration.js';
import { registerRepo } from './registerRepo/registerRepo.js';
import { registerRepos } from './registerRepos/registerRepos.js';
import { releaseGenerationWrite } from './releaseGenerationWrite/releaseGenerationWrite.js';
import { reserveGenerationWrite } from './reserveGenerationWrite/reserveGenerationWrite.js';
import { resolveFrontendProjectionLineage } from './resolveFrontendProjectionLineage/resolveFrontendProjectionLineage.js';
import { upsertAccount } from './upsertAccount/upsertAccount.js';

const systemRepoTables = {
  generationState: makeTable({
    name: 'generationState',
    shape: {
      generationId: primitives.primaryKey({
        abbreviation: coreAbbreviations.generation,
      }),
      prevGenerationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
        nullable: true,
      }),
      successorGenerationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
        nullable: true,
      }),
      initialDeployId: primitives.opaqueId({
        abbreviation: coreAbbreviations.deploy,
      }),
      activeDeployId: primitives.opaqueId({
        abbreviation: coreAbbreviations.deploy,
        nullable: true,
      }),
      preparingDeployId: primitives.opaqueId({
        abbreviation: coreAbbreviations.deploy,
        nullable: true,
      }),
      readiness: primitives.enum({
        values: ['initializing', 'ready', 'failed'],
      }),
      admission: primitives.enum({
        values: ['closed', 'open', 'draining', 'drained'],
      }),
      activeSystemSpec: primitives.json({
        schema: SystemSpecSchema,
        nullable: true,
      }),
      preparingSystemSpec: primitives.json({
        schema: SystemSpecSchema,
        nullable: true,
      }),
      failure: primitives.text({ nullable: true }),
      createdAt: primitives.date(),
      readyAt: primitives.date({ nullable: true }),
      openedAt: primitives.date({ nullable: true }),
      drainFrozenAt: primitives.date({ nullable: true }),
      drainedAt: primitives.date({ nullable: true }),
    },
  }),
  drainBounds: makeTable({
    name: 'drainBounds',
    shape: {
      deployId: primitives.opaqueId({
        abbreviation: coreAbbreviations.deploy,
      }),
      repoType: primitives.enum({
        values: [
          'ServiceBlockRepo',
          'AccountBlockRepo',
          'FrontendRepo',
          'ServiceFrontendRepo',
        ],
      }),
      repoName: primitives.text(),
      terminalCursor: primitives.text({ nullable: true }),
      terminalIndex: primitives.integer({ nullable: true }),
      systemWorkerName: primitives.text({ nullable: true }),
      frontendBlockRepoName: primitives.text({ nullable: true }),
      terminalFrontendIndex: primitives.integer({ nullable: true }),
      segmentKind: primitives.enum({
        values: ['root', 'inherited', 'no-local-segment'],
        nullable: true,
      }),
      predecessorGenerationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
        nullable: true,
      }),
      predecessorRepoName: primitives.text({ nullable: true }),
      predecessorTerminalFrontendIndex: primitives.integer({ nullable: true }),
      capturedAt: primitives.date(),
    },
    indexes: [
      {
        name: 'drainBounds_deployId_repoName_unique',
        columns: ['deployId', 'repoName'],
        unique: true,
      },
    ],
  }),
  replayCompletions: makeTable({
    name: 'replayCompletions',
    shape: {
      deployId: primitives.opaqueId({
        abbreviation: coreAbbreviations.deploy,
      }),
      repoType: primitives.enum({
        values: ['ServiceRepo', 'AccountRepo'],
      }),
      prevRepoName: primitives.text(),
      targetRepoName: primitives.text(),
      terminalIndex: primitives.integer({ nullable: true }),
      blockCount: primitives.integer(),
      completedAt: primitives.date(),
    },
    indexes: [
      {
        name: 'replayCompletions_deployId_targetRepoName_unique',
        columns: ['deployId', 'targetRepoName'],
        unique: true,
      },
    ],
  }),
  frontendWebSocketTickets: makeTable({
    name: 'frontendWebSocketTickets',
    shape: {
      ticketHash: primitives.text(),
      deployId: primitives.opaqueId({
        abbreviation: coreAbbreviations.deploy,
      }),
      repoName: primitives.text(),
      frontendVersion: primitives.text(),
      expiresAt: primitives.date(),
    },
    indexes: [
      {
        name: 'frontendWebSocketTickets_ticketHash_unique',
        columns: ['ticketHash'],
        unique: true,
      },
    ],
  }),
  serviceFrontendWebSocketTickets: makeTable({
    name: 'serviceFrontendWebSocketTickets',
    shape: {
      ticketHash: primitives.text(),
      deployId: primitives.opaqueId({
        abbreviation: coreAbbreviations.deploy,
      }),
      serviceName: primitives.text(),
      actorName: primitives.text(),
      actorId: primitives.opaqueId({
        abbreviation: coreAbbreviations.actor,
      }),
      frontendName: primitives.text(),
      frontendVersion: primitives.text(),
      expiresAt: primitives.date(),
    },
    indexes: [
      {
        name: 'serviceFrontendWebSocketTickets_ticketHash_unique',
        columns: ['ticketHash'],
        unique: true,
      },
    ],
  }),
  generationWriteReservations: makeTable({
    name: 'generationWriteReservations',
    shape: {
      reservationId: primitives.primaryKey({ abbreviation: 'gwr' }),
      deployId: primitives.opaqueId({
        abbreviation: coreAbbreviations.deploy,
      }),
      operationName: primitives.text(),
      reservedAt: primitives.date(),
    },
  }),
  accounts: makeTable({
    name: 'accounts',
    shape: {
      accountId: primitives.primaryKey({
        abbreviation: coreAbbreviations.account,
      }),
    },
  }),
  repos: makeTable({
    name: 'repos',
    shape: {
      repoType: primitives.text(),
      repoName: primitives.text(),
      tableNames: primitives.json({
        schema: Schema.Array(Schema.String),
      }),
    },
    indexes: [
      {
        name: 'repos_repo_type_repo_name_unique',
        columns: ['repoType', 'repoName'],
        unique: true,
      },
    ],
  }),
} satisfies IAnyTables;

const systemRepoDbConfig = makeDbConfig({ tables: systemRepoTables });
const systemRepoDrizzleSchemas = systemRepoDbConfig.schema;

export class SystemRepo extends DurableObject {
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static getRepo(props: { generationId: string }): SystemRepo {
    return env.SYSTEM_REPO.getByName(
      `${systemWorkerAbbreviations.systemRepo}_${props.generationId}`,
    );
  }

  readonly #db: IDb<typeof systemRepoDbConfig>;
  readonly #generationId: string;

  constructor(ctx: DurableObjectState, workerEnv: Env) {
    super(ctx, workerEnv);
    const name = ctx.id.name;
    const prefix = `${systemWorkerAbbreviations.systemRepo}_`;
    invariant(
      name !== undefined &&
        name.startsWith(prefix) &&
        name.length > prefix.length &&
        !name.slice(prefix.length).includes('/'),
      'SystemRepo must be accessed via getByName',
    );
    this.#generationId = name.slice(prefix.length);

    const { db } = managedRuntime.runSync(
      initializeSystemRepo({
        storage: ctx.storage,
        dbConfig: systemRepoDbConfig,
      }).pipe(Effect.provide(AsyncLive)),
    );
    this.#db = db;

    ctx.blockConcurrencyWhile(async () => {
      await managedRuntime.runPromise(
        Effect.gen(this, function* () {
          yield* migrateSystemRepo({
            storage: this.ctx.storage,
            db: this.#db,
            schema: systemRepoDbConfig.schema,
          });
          yield* registerRepo({
            db: this.#db,
            repoTable: systemRepoDrizzleSchemas.repos,
            registration: {
              repoType: 'SystemRepo',
              repoName: name,
              tableNames: [
                'generationState',
                'drainBounds',
                'replayCompletions',
                'frontendWebSocketTickets',
                'serviceFrontendWebSocketTickets',
                'generationWriteReservations',
                'accounts',
                'repos',
              ],
            },
          });
        }).pipe(Effect.provide(AsyncLive)),
      );
    });
  }

  async getAccountIds(): Promise<
    Schema.EitherEncoded<Array<InferIdFromAbbreviation>, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      getAccountIds({
        db: this.#db as never,
        accountTable: systemRepoDrizzleSchemas.accounts as never,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getGenerationState() {
    return managedRuntime.runPromise(
      getGenerationState({
        db: this.#db,
        generationId: this.#generationId,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        drainBoundsTable: systemRepoDrizzleSchemas.drainBounds,
        drainBoundsColumns: getTableColumns(
          systemRepoDrizzleSchemas.drainBounds,
        ),
        replayCompletionsTable: systemRepoDrizzleSchemas.replayCompletions,
        replayCompletionsColumns: getTableColumns(
          systemRepoDrizzleSchemas.replayCompletions,
        ),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async assertGenerationAdmission(props: {
    deployId: string;
    mode: 'read' | 'write';
  }) {
    return managedRuntime.runPromise(
      assertGenerationAdmission({
        db: this.#db,
        deployId: props.deployId,
        generationId: this.#generationId,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        mode: props.mode,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async reserveGenerationWrite(props: {
    deployId: string;
    operationName: string;
  }): Promise<Schema.EitherEncoded<string, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      reserveGenerationWrite({
        db: this.#db,
        deployId: props.deployId,
        generationId: this.#generationId,
        operationName: props.operationName,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        generationWriteReservationTable:
          systemRepoDrizzleSchemas.generationWriteReservations,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async releaseGenerationWrite(props: {
    deployId: string;
    reservationId: string;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      releaseGenerationWrite({
        db: this.#db,
        deployId: props.deployId,
        generationId: this.#generationId,
        reservationId: props.reservationId,
        generationWriteReservationTable:
          systemRepoDrizzleSchemas.generationWriteReservations,
        generationWriteReservationColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationWriteReservations,
        ),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async resolveFrontendProjectionLineage(props: {
    deployId: string;
    target:
      | Readonly<{
          kind: 'account';
          accountId: IAccountId;
          accountName: string;
          actorId: IActorId;
          actorName: string;
          frontendName: string;
        }>
      | Readonly<{
          kind: 'service';
          serviceName: string;
          actorName: string;
          actorId: IActorId;
          frontendName: string;
        }>;
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        mode: 'live' | 'no-local-segment';
        predecessor: Readonly<{
          generationId: string;
          repoName: string;
          terminalFrontendIndex: number;
        }> | null;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      resolveFrontendProjectionLineage({
        db: this.#db,
        deployId: props.deployId,
        generationId: this.#generationId,
        target: props.target,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        drainBoundsTable: systemRepoDrizzleSchemas.drainBounds,
        drainBoundsColumns: getTableColumns(
          systemRepoDrizzleSchemas.drainBounds,
        ),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async createFrontendWebSocketTicket(props: {
    deployId: string;
    repoName: string;
    frontendVersion: string;
  }) {
    return managedRuntime.runPromise(
      createFrontendWebSocketTicket({
        db: this.#db,
        deployId: props.deployId,
        generationId: this.#generationId,
        repoName: props.repoName,
        frontendVersion: props.frontendVersion,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        frontendWebSocketTicketTable:
          systemRepoDrizzleSchemas.frontendWebSocketTickets,
        frontendWebSocketTicketColumns: getTableColumns(
          systemRepoDrizzleSchemas.frontendWebSocketTickets,
        ),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async consumeFrontendWebSocketTicket(props: { ticket: string }) {
    return managedRuntime.runPromise(
      consumeFrontendWebSocketTicket({
        db: this.#db,
        generationId: this.#generationId,
        ticket: props.ticket,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        frontendWebSocketTicketTable:
          systemRepoDrizzleSchemas.frontendWebSocketTickets,
        frontendWebSocketTicketColumns: getTableColumns(
          systemRepoDrizzleSchemas.frontendWebSocketTickets,
        ),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async createServiceFrontendWebSocketTicket(props: {
    deployId: string;
    serviceName: string;
    actorName: string;
    actorId: IActorId;
    frontendName: string;
    frontendVersion: string;
  }): Promise<Schema.EitherEncoded<string, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      createServiceFrontendWebSocketTicket({
        db: this.#db,
        deployId: props.deployId,
        generationId: this.#generationId,
        serviceName: props.serviceName,
        actorName: props.actorName,
        actorId: props.actorId,
        frontendName: props.frontendName,
        frontendVersion: props.frontendVersion,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        serviceFrontendWebSocketTicketTable:
          systemRepoDrizzleSchemas.serviceFrontendWebSocketTickets,
        serviceFrontendWebSocketTicketColumns: getTableColumns(
          systemRepoDrizzleSchemas.serviceFrontendWebSocketTickets,
        ),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async consumeServiceFrontendWebSocketTicket(props: {
    ticket: string;
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        serviceName: string;
        actorName: string;
        actorId: IActorId;
        frontendName: string;
        frontendVersion: string;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      consumeServiceFrontendWebSocketTicket({
        db: this.#db,
        generationId: this.#generationId,
        ticket: props.ticket,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        serviceFrontendWebSocketTicketTable:
          systemRepoDrizzleSchemas.serviceFrontendWebSocketTickets,
        serviceFrontendWebSocketTicketColumns: getTableColumns(
          systemRepoDrizzleSchemas.serviceFrontendWebSocketTickets,
        ),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainGeneration(props: {
    deployId: string;
    mode: 'freeze' | 'complete';
    successorGenerationId: string | null;
  }) {
    return managedRuntime.runPromise(
      drainGeneration({
        db: this.#db,
        deployId: props.deployId,
        mode: props.mode,
        successorGenerationId: props.successorGenerationId,
        generationId: this.#generationId,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        drainBoundsTable: systemRepoDrizzleSchemas.drainBounds,
        drainBoundsColumns: getTableColumns(
          systemRepoDrizzleSchemas.drainBounds,
        ),
        repoTable: systemRepoDrizzleSchemas.repos,
        frontendWebSocketTicketTable:
          systemRepoDrizzleSchemas.frontendWebSocketTickets,
        serviceFrontendWebSocketTicketTable:
          systemRepoDrizzleSchemas.serviceFrontendWebSocketTickets,
        generationWriteReservationTable:
          systemRepoDrizzleSchemas.generationWriteReservations,
        generationWriteReservationColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationWriteReservations,
        ),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async prepareGeneration(props: {
    deployId: string;
    prevGenerationId: string | null;
    systemSpec: ISystemSpec;
    seeds: readonly IDeploySeedCommand[];
  }) {
    return managedRuntime.runPromise(
      prepareGeneration({
        db: this.#db,
        configuredSystemId: this.env.ZEROSPIN_SYSTEM_ID,
        deployId: props.deployId,
        generationId: this.#generationId,
        prevGenerationId: props.prevGenerationId,
        systemSpec: props.systemSpec,
        seeds: props.seeds,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        replayCompletionsTable: systemRepoDrizzleSchemas.replayCompletions,
        replayCompletionsColumns: getTableColumns(
          systemRepoDrizzleSchemas.replayCompletions,
        ),
        repoTable: systemRepoDrizzleSchemas.repos,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async openGeneration(props: { deployId: string }) {
    return managedRuntime.runPromise(
      openGeneration({
        db: this.#db,
        deployId: props.deployId,
        drainBoundsTable: systemRepoDrizzleSchemas.drainBounds,
        generationId: this.#generationId,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async upsertAccount(props: {
    accountId: string;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    const { accountId } = props;
    return managedRuntime.runPromise(
      upsertAccount({
        db: this.#db as never,
        accountTable: systemRepoDrizzleSchemas.accounts as never,
        accountId,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async registerRepo(props: {
    registration: IRepoRegistration;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      registerRepo({
        db: this.#db,
        repoTable: systemRepoDrizzleSchemas.repos,
        registration: props.registration,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async registerRepos(props: {
    serviceFrontendRepo: {
      repoName: string;
      tableNames: readonly string[];
    };
    serviceFrontendBlockRepo: {
      repoName: string;
      tableNames: readonly string[];
    };
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      registerRepos({
        db: this.#db,
        repoTable: systemRepoDrizzleSchemas.repos,
        serviceFrontendRepo: props.serviceFrontendRepo,
        serviceFrontendBlockRepo: props.serviceFrontendBlockRepo,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getRepoRegistrations(props: {
    repoType: IRepoType;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      getRepoRegistrations({
        db: this.#db,
        repoTable: systemRepoDrizzleSchemas.repos,
        repoType: props.repoType,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getRepoTableRows(props: {
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      getRepoTableRows({
        db: this.#db,
        schema: systemRepoDbConfig.schema,
        tableName: props.tableName,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
}
