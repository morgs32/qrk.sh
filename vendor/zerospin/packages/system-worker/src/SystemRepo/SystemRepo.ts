/*
 * System-worker annotation:
 * Defines the SystemRepo Durable Object shell and local storage wiring.
 * Public RPC/lifecycle methods should delegate to same-named Effect functions instead of growing inline workflow bodies here.
 */

import type { IUserRef } from '@zerospin/core/aggregate/types';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type {
  IAggregateCommand,
  IEncodedCommand,
  IExecutedServiceCommand,
  IFailedServiceCommand,
  IPushBlock,
  IServiceCommand,
  IStagedReplicaCommand,
} from '@zerospin/core/contracts/types';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import type { IDb } from '@zerospin/core/drizzle/types';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type {
  IAggregateId,
  IAnyTables,
  InferIdFromAbbreviation,
} from '@zerospin/core/models/types';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type {
  IRepoRegistration,
  IRepoTableData,
  IRepoType,
  ISystemId,
  ISystemSpec,
} from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError, type IAnyErrorJson } from '@zerospin/error';
import { DurableObject, env } from 'cloudflare:workers';
import { getTableColumns } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import { system as staticSystem } from 'system';
import invariant from 'tiny-invariant';

import { encodeAggregateCommand } from '../AggregateRepo/encodeAggregateCommand/encodeAggregateCommand.js';
import { AggregateFinalizationReceiptSchema } from '../blockSchemas.js';
import { makeDeliveryQueue } from '../makeDeliveryQueue/makeDeliveryQueue.js';
import {
  makeSystemRuntime,
  type ISystemRuntime,
} from '../makeSystemRuntime.js';
import { managedRuntime } from '../managedRuntime.js';
import { encodeServiceCommand } from '../ServiceRepo/encodeServiceCommand/encodeServiceCommand.js';
import { WorkerExportsSystemWorkerResolver } from '../SystemWorkerResolver/WorkerExportsSystemWorkerResolver.js';

import { activateDeploy } from './activateDeploy/activateDeploy.js';
import { alarm } from './alarm/alarm.js';
import { allocateDeploy } from './allocateDeploy/allocateDeploy.js';
import { assertGenerationAdmission } from './assertGenerationAdmission/assertGenerationAdmission.js';
import { consumeAggregateFrontendWebSocketTicket } from './consumeAggregateFrontendWebSocketTicket/consumeAggregateFrontendWebSocketTicket.js';
import { consumeServiceFrontendWebSocketTicket } from './consumeServiceFrontendWebSocketTicket/consumeServiceFrontendWebSocketTicket.js';
import { createAggregateFrontendWebSocketTicket } from './createAggregateFrontendWebSocketTicket/createAggregateFrontendWebSocketTicket.js';
import { createServiceFrontendWebSocketTicket } from './createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.js';
import { drainSystemWrites } from './drainSystemWrites/drainSystemWrites.js';
import { fetch as fetchSystemRepo } from './fetch/fetch.js';
import { finalizeAggregateCommands } from './finalizeAggregateCommands/finalizeAggregateCommands.js';
import { finalizeServiceCommands } from './finalizeServiceCommands/finalizeServiceCommands.js';
import { getActiveGenerationId } from './getActiveGenerationId/getActiveGenerationId.js';
import { getAggregateIds } from './getAggregateIds/getAggregateIds.js';
import { getDeploy } from './getDeploy/getDeploy.js';
import { getGenerationState } from './getGenerationState/getGenerationState.js';
import { getReadiness } from './getReadiness/getReadiness.js';
import { getRepoRegistrations } from './getRepoRegistrations/getRepoRegistrations.js';
import { getRepoTableRows } from './getRepoTableRows/getRepoTableRows.js';
import { initializeSystemRepo } from './initializeSystemRepo.js';
import { migrateSystemRepo } from './migrateSystemRepo.js';
import { pushCommands } from './pushCommands/pushCommands.js';
import { registerRepo } from './registerRepo/registerRepo.js';
import { registerRepos } from './registerRepos/registerRepos.js';
import { resolveFrontendProjectionLineage } from './resolveFrontendProjectionLineage/resolveFrontendProjectionLineage.js';
import { startDeploy } from './startDeploy/startDeploy.js';
import {
  SystemWriteCommandsSchema,
  SystemWriteResultSchema,
  SystemWriteTargetSchema,
} from './systemWriteSchemas.js';
import { upsertAggregate } from './upsertAggregate/upsertAggregate.js';

const systemRepoTables = {
  selection: makeTable({
    name: 'selection',
    shape: {
      id: primitives.primaryKey({ abbreviation: 'sctl' }),
      activeDeployId: primitives.opaqueId({
        abbreviation: coreAbbreviations.deploy,
        nullable: true,
      }),
      activatingDeployId: primitives.opaqueId({
        abbreviation: coreAbbreviations.deploy,
        nullable: true,
      }),
      writeGenerationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
        nullable: true,
      }),
      lastWriteIndex: primitives.integer(),
      lastCleanRequestId: primitives.text({ nullable: true }),
    },
  }),
  deploy: makeTable({
    name: 'deploy',
    shape: {
      id: primitives.primaryKey({
        abbreviation: coreAbbreviations.deploy,
      }),
      prevDeployId: primitives.self({
        relation: 'previousDeploy',
        inverse: 'nextDeploys',
        nullable: true,
      }),
      generationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
      }),
      workerVersionId: primitives.text(),
      systemSpec: primitives.json({ schema: SystemSpecSchema }),
      clean: primitives.boolean(),
      status: primitives.enum({
        values: ['activating', 'succeeded', 'failed'],
      }),
      activationCheckpoint: primitives.enum({
        values: [
          'allocated',
          'generation-prepared',
          'continuous-replay',
          'pre-cut-ready',
          'ownership-cut',
          'source-writes-terminal',
          'fixed-point-drained',
          'final-replay-complete',
        ],
      }),
      failure: primitives.json({
        schema: ZerospinError.schema,
        nullable: true,
      }),
      startedAt: primitives.date(),
      completedAt: primitives.date({ nullable: true }),
    },
    indexes: [
      {
        name: 'deploy_workerVersionId_clean_unique',
        columns: ['workerVersionId', 'clean'],
        unique: true,
      },
    ],
  }),
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
      phase: primitives.enum({
        values: ['closed', 'migrating', 'open', 'draining', 'retired'],
      }),
      lastWriteIndex: primitives.integer(),
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
      retirementCompletedAt: primitives.date({ nullable: true }),
      retiredAt: primitives.date({ nullable: true }),
    },
  }),
  drainBounds: makeTable({
    name: 'drainBounds',
    shape: {
      generationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
      }),
      repoType: primitives.enum({
        values: [
          'ServiceBlockRepo',
          'AggregateBlockRepo',
          'ServiceBlockSubscriber',
        ],
      }),
      sourceRepoName: primitives.text(),
      targetRepoName: primitives.text({ nullable: true }),
      terminalCursor: primitives.text({ nullable: true }),
      terminalIndex: primitives.integer({ nullable: true }),
      capturedAt: primitives.date(),
    },
    indexes: [
      {
        name: 'drainBounds_generationId_repoType_source_target_unique',
        columns: [
          'generationId',
          'repoType',
          'sourceRepoName',
          'targetRepoName',
        ],
        unique: true,
      },
    ],
  }),
  replayCompletions: makeTable({
    name: 'replayCompletions',
    shape: {
      generationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
      }),
      repoType: primitives.enum({
        values: ['ServiceRepo', 'AggregateRepo'],
      }),
      prevRepoName: primitives.text(),
      targetRepoName: primitives.text(),
      terminalCursor: primitives.text({ nullable: true }),
      terminalIndex: primitives.integer({ nullable: true }),
      blockCount: primitives.integer(),
      completedAt: primitives.date(),
    },
    indexes: [
      {
        name: 'replayCompletions_generationId_targetRepoName_unique',
        columns: ['generationId', 'targetRepoName'],
        unique: true,
      },
    ],
  }),
  aggregateFrontendWebSocketTickets: makeTable({
    name: 'aggregateFrontendWebSocketTickets',
    shape: {
      ticketHash: primitives.text(),
      generationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
      }),
      repoName: primitives.text(),
      aggregateId: primitives.opaqueId({
        abbreviation: coreAbbreviations.aggregate,
      }),
      aggregateName: primitives.text(),
      userId: primitives.text(),
      frontendName: primitives.text(),
      aggregateFrontendLock: primitives.json({
        schema: AggregateFrontendLockSchema,
      }),
      expiresAt: primitives.date(),
    },
    indexes: [
      {
        name: 'aggregateFrontendWebSocketTickets_ticketHash_unique',
        columns: ['ticketHash'],
        unique: true,
      },
    ],
  }),
  serviceFrontendWebSocketTickets: makeTable({
    name: 'serviceFrontendWebSocketTickets',
    shape: {
      ticketHash: primitives.text(),
      generationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
      }),
      repoName: primitives.text(),
      serviceName: primitives.text(),
      userId: primitives.text(),
      frontendName: primitives.text(),
      serviceFrontendLock: primitives.json({
        schema: ServiceFrontendLockSchema,
      }),
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
  systemWrites: makeTable({
    name: 'systemWrites',
    shape: {
      writeIndex: primitives.integer({ primaryKey: true }),
      generationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
      }),
      operation: primitives.enum({
        values: [
          'pushCommands',
          'finalizeAggregateCommands',
          'finalizeServiceCommands',
        ],
      }),
      target: primitives.json({ schema: SystemWriteTargetSchema }),
      commands: primitives.json({ schema: SystemWriteCommandsSchema }),
      result: primitives.json({
        schema: SystemWriteResultSchema,
        nullable: true,
      }),
      deliveryAttemptCount: primitives.integer(),
      lastDeliveryFailure: primitives.json({
        schema: ZerospinError.schema,
        nullable: true,
      }),
      createdAt: primitives.date(),
      lastDeliveryAttemptAt: primitives.date({ nullable: true }),
      resolvedAt: primitives.date({ nullable: true }),
    },
    indexes: [
      {
        name: 'systemWrites_generationId_writeIndex',
        columns: ['generationId', 'writeIndex'],
      },
    ],
  }),
  aggregates: makeTable({
    name: 'aggregates',
    shape: {
      generationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
      }),
      aggregateId: primitives.opaqueId({
        abbreviation: coreAbbreviations.aggregate,
      }),
    },
    indexes: [
      {
        name: 'aggregates_generationId_aggregateId_unique',
        columns: ['generationId', 'aggregateId'],
        unique: true,
      },
    ],
  }),
  repos: makeTable({
    name: 'repos',
    shape: {
      generationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
      }),
      repoType: primitives.text(),
      repoName: primitives.text(),
      tableNames: primitives.json({
        schema: Schema.Array(Schema.String),
      }),
    },
    indexes: [
      {
        name: 'repos_generation_id_repo_type_repo_name_unique',
        columns: ['generationId', 'repoType', 'repoName'],
        unique: true,
      },
    ],
  }),
} satisfies IAnyTables;

export const systemRepoDbConfig = makeDbConfig({ tables: systemRepoTables });
export const systemRepoDrizzleSchemas = systemRepoDbConfig.schema;

export class SystemRepo extends DurableObject {
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static getRepo(props: { systemId: ISystemId }): SystemRepo {
    return env.SYSTEM_REPO.getByName(props.systemId);
  }

  readonly #db: IDb<typeof systemRepoDbConfig>;
  readonly #deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  #activationDeployId: string | null = null;
  #activationPromise: Promise<void> | null = null;
  readonly #environment: 'dev' | 'production';
  readonly #executingWorkerVersionId: string;
  readonly #productionCleanRequestId: string | null;
  readonly #productionDeployId: Promise<string | null>;
  readonly #readiness: Promise<void>;
  readonly #runtime: ISystemRuntime;
  readonly #systemId: ISystemId;
  readonly #systemSpec: ISystemSpec;

  constructor(ctx: DurableObjectState, workerEnv: Env) {
    super(ctx, workerEnv);
    const name = ctx.id.name;
    invariant(
      name === workerEnv.ZEROSPIN_SYSTEM_ID,
      'SystemRepo must be addressed by the exact systemId',
    );

    this.#systemId = Schema.decodeUnknownSync(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(workerEnv.ZEROSPIN_SYSTEM_ID);
    this.#executingWorkerVersionId = workerEnv.WORKER_VERSION_METADATA.id;
    invariant(
      this.#executingWorkerVersionId.length > 0,
      'SystemRepo requires a non-empty WORKER_VERSION_METADATA.id',
    );
    this.#environment = Schema.decodeUnknownSync(
      Schema.Literal('dev', 'production'),
    )(workerEnv.ZEROSPIN_ENVIRONMENT);
    this.#productionCleanRequestId =
      this.#environment === 'production'
        ? (workerEnv.ZEROSPIN_CLEAN_REQUEST_ID ?? null)
        : null;
    this.#systemSpec = makeSystemSpec({ system: staticSystem });
    this.#runtime = makeSystemRuntime({
      systemWorkerResolver: WorkerExportsSystemWorkerResolver,
    });

    const { db } = managedRuntime.runSync(
      initializeSystemRepo({
        storage: ctx.storage,
        dbConfig: systemRepoDbConfig,
      }).pipe(Effect.provide(AsyncLive)),
    );
    this.#db = db;
    this.#deliveryQueue = makeDeliveryQueue({
      storage: ctx.storage,
      hasPending: () =>
        Effect.sync(() => {
          const selection = this.#db
            .select({
              activatingDeployId:
                systemRepoDrizzleSchemas.selection.activatingDeployId,
            })
            .from(systemRepoDrizzleSchemas.selection)
            .get();
          return selection?.activatingDeployId != null;
        }),
    });

    this.#readiness = ctx.blockConcurrencyWhile(() =>
      managedRuntime.runPromise(
        migrateSystemRepo({
          db: this.#db,
          schema: systemRepoDbConfig.schema,
        }).pipe(Effect.provide(AsyncLive)),
      ),
    );
    void this.#readiness.catch(() => undefined);

    this.#productionDeployId =
      this.#environment === 'dev'
        ? Promise.resolve(null)
        : this.#readiness.then(async () => {
            const allocation = await this.#runtime.runPromise(
              allocateDeploy({
                db: this.#db,
                workerVersionId: this.#executingWorkerVersionId,
                clean: false,
                cleanRequestId: this.#productionCleanRequestId,
                systemSpec: this.#systemSpec,
                selectionTable: systemRepoDrizzleSchemas.selection,
                selectionColumns: getTableColumns(
                  systemRepoDrizzleSchemas.selection,
                ),
                deployTable: systemRepoDrizzleSchemas.deploy,
                deployColumns: getTableColumns(systemRepoDrizzleSchemas.deploy),
              }),
            );
            void this.#scheduleActivation(allocation.deployId).catch(
              () => undefined,
            );
            return allocation.deployId;
          });
    void this.#productionDeployId.catch(() => undefined);
  }

  #scheduleActivation(deployId: string): Promise<void> {
    if (this.#activationPromise !== null) {
      if (this.#activationDeployId === deployId) {
        return this.#activationPromise;
      }
      return this.#activationPromise.then(
        () => this.#scheduleActivation(deployId),
        () => this.#scheduleActivation(deployId),
      );
    }

    this.#activationDeployId = deployId;
    const activationPromise = this.#runtime
      .runPromise(
        activateDeploy({
          db: this.#db,
          configuredSystemId: this.#systemId,
          executingWorkerVersionId: this.#executingWorkerVersionId,
          deployId,
          cleanRequestId: this.#productionCleanRequestId,
          submitTargetedSeed: ({ generationId, seed }) =>
            seed.commandType === 'aggregate'
              ? Effect.gen(this, function* () {
                  const encoded = yield* encodeAggregateCommand({
                    aggregateName: seed.aggregateName,
                    command: seed,
                  });
                  const receipt = yield* finalizeAggregateCommands({
                    db: this.#db,
                    aggregateName: seed.aggregateName,
                    aggregateId: seed.aggregateId,
                    commands: [encoded],
                    deliveryQueue: this.#deliveryQueue,
                    generationStateTable:
                      systemRepoDrizzleSchemas.generationState,
                    generationStateColumns: getTableColumns(
                      systemRepoDrizzleSchemas.generationState,
                    ),
                    interruptSystemWriteCapture: false,
                    selectionTable: systemRepoDrizzleSchemas.selection,
                    selectionColumns: getTableColumns(
                      systemRepoDrizzleSchemas.selection,
                    ),
                    storage: this.ctx.storage,
                    systemWriteTable: systemRepoDrizzleSchemas.systemWrites,
                    systemWriteColumns: getTableColumns(
                      systemRepoDrizzleSchemas.systemWrites,
                    ),
                    targetGenerationId: generationId,
                  });
                  if (receipt.failedCommands.length !== 0) {
                    return yield* new ZerospinError({
                      code: 'generation-seed-aggregate-finalization-failed',
                      message:
                        'An aggregate seed command failed during generation preparation',
                      extra: {
                        generationId,
                        commandId: seed.id,
                        failedCommandCount: receipt.failedCommands.length,
                      },
                    });
                  }
                })
              : Effect.gen(this, function* () {
                  const encoded = yield* encodeServiceCommand({
                    serviceName: seed.serviceName,
                    command: seed,
                  });
                  const receipt = yield* finalizeServiceCommands({
                    db: this.#db,
                    serviceName: seed.serviceName,
                    commands: [encoded],
                    deliveryQueue: this.#deliveryQueue,
                    generationStateTable:
                      systemRepoDrizzleSchemas.generationState,
                    generationStateColumns: getTableColumns(
                      systemRepoDrizzleSchemas.generationState,
                    ),
                    interruptSystemWriteCapture: false,
                    selectionTable: systemRepoDrizzleSchemas.selection,
                    selectionColumns: getTableColumns(
                      systemRepoDrizzleSchemas.selection,
                    ),
                    storage: this.ctx.storage,
                    systemWriteTable: systemRepoDrizzleSchemas.systemWrites,
                    systemWriteColumns: getTableColumns(
                      systemRepoDrizzleSchemas.systemWrites,
                    ),
                    targetGenerationId: generationId,
                  });
                  if (receipt.failedCommands.length !== 0) {
                    return yield* new ZerospinError({
                      code: 'generation-seed-service-finalization-failed',
                      message:
                        'A service seed command failed during generation preparation',
                      extra: {
                        generationId,
                        commandId: seed.id,
                        failedCommandCount: receipt.failedCommands.length,
                      },
                    });
                  }
                }),
          drainSystemWrites: ({
            generationId,
            throughWriteIndex,
            includeHeld,
          }) =>
            drainSystemWrites({
              db: this.#db,
              deliveryQueue: this.#deliveryQueue,
              generationId,
              generationStateTable: systemRepoDrizzleSchemas.generationState,
              generationStateColumns: getTableColumns(
                systemRepoDrizzleSchemas.generationState,
              ),
              ...(includeHeld === true ? { includeHeld } : {}),
              interruptSystemWriteCapture: false,
              storage: this.ctx.storage,
              systemWriteTable: systemRepoDrizzleSchemas.systemWrites,
              systemWriteColumns: getTableColumns(
                systemRepoDrizzleSchemas.systemWrites,
              ),
              throughWriteIndex,
            }),
          selectionTable: systemRepoDrizzleSchemas.selection,
          selectionColumns: getTableColumns(systemRepoDrizzleSchemas.selection),
          deployTable: systemRepoDrizzleSchemas.deploy,
          deployColumns: getTableColumns(systemRepoDrizzleSchemas.deploy),
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
          repoTable: systemRepoDrizzleSchemas.repos,
        }),
      )
      .finally(() => {
        if (this.#activationDeployId === deployId) {
          this.#activationDeployId = null;
          this.#activationPromise = null;
        }
      });
    this.#activationPromise = activationPromise;
    this.ctx.waitUntil(activationPromise.catch(() => undefined));
    return activationPromise;
  }

  override async fetch(request: Request): Promise<Response> {
    return this.#runtime
      .runPromise(
        fetchSystemRepo({
          db: this.#db,
          request,
          readiness: this.#readiness,
          generationStateTable: systemRepoDrizzleSchemas.generationState,
          generationStateColumns: getTableColumns(
            systemRepoDrizzleSchemas.generationState,
          ),
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
          Effect.catchAll(failure =>
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

  async startDeploy(props: { clean: boolean }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        activationCheckpoint:
          | 'allocated'
          | 'generation-prepared'
          | 'continuous-replay'
          | 'pre-cut-ready'
          | 'ownership-cut'
          | 'source-writes-terminal'
          | 'fixed-point-drained'
          | 'final-replay-complete';
        clean: boolean;
        deployId: string;
        failure: IAnyErrorJson | null;
        generationId: string;
        status: 'activating' | 'succeeded' | 'failed';
        workerVersionId: string;
      }>,
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      startDeploy({
        db: this.#db,
        request: props,
        readiness: this.#readiness,
        environment: this.#environment,
        workerVersionId: this.#executingWorkerVersionId,
        systemSpec: this.#systemSpec,
        scheduleActivation: deployId => this.#scheduleActivation(deployId),
        selectionTable: systemRepoDrizzleSchemas.selection,
        selectionColumns: getTableColumns(systemRepoDrizzleSchemas.selection),
        deployTable: systemRepoDrizzleSchemas.deploy,
        deployColumns: getTableColumns(systemRepoDrizzleSchemas.deploy),
      }).pipe(encodeRpc),
    );
  }

  async getDeploy(props: { deployId: string }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        activationCheckpoint:
          | 'allocated'
          | 'generation-prepared'
          | 'continuous-replay'
          | 'pre-cut-ready'
          | 'ownership-cut'
          | 'source-writes-terminal'
          | 'fixed-point-drained'
          | 'final-replay-complete';
        clean: boolean;
        deployId: string;
        failure: IAnyErrorJson | null;
        generationId: string;
        status: 'activating' | 'succeeded' | 'failed';
        workerVersionId: string;
      }>,
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      getDeploy({
        db: this.#db,
        request: props,
        readiness: this.#readiness,
        environment: this.#environment,
        scheduleActivation: deployId => this.#scheduleActivation(deployId),
        deployTable: systemRepoDrizzleSchemas.deploy,
        deployColumns: getTableColumns(systemRepoDrizzleSchemas.deploy),
      }).pipe(encodeRpc),
    );
  }

  async getReadiness(): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getReadiness({
        db: this.#db,
        readiness: this.#readiness,
        environment: this.#environment,
        executingWorkerVersionId: this.#executingWorkerVersionId,
        productionDeployId: this.#productionDeployId,
        scheduleActivation: deployId => this.#scheduleActivation(deployId),
        selectionTable: systemRepoDrizzleSchemas.selection,
        selectionColumns: getTableColumns(systemRepoDrizzleSchemas.selection),
        deployTable: systemRepoDrizzleSchemas.deploy,
        deployColumns: getTableColumns(systemRepoDrizzleSchemas.deploy),
      }).pipe(encodeRpc),
    );
  }

  async getActiveGenerationId(): Promise<
    Schema.EitherEncoded<string, IAnyErrorJson>
  > {
    return this.#runtime.runPromise(
      getActiveGenerationId({
        db: this.#db,
        readiness: this.#readiness,
        environment: this.#environment,
        productionDeployId: this.#productionDeployId,
        scheduleActivation: deployId => this.#scheduleActivation(deployId),
        selectionTable: systemRepoDrizzleSchemas.selection,
        selectionColumns: getTableColumns(systemRepoDrizzleSchemas.selection),
        deployTable: systemRepoDrizzleSchemas.deploy,
        deployColumns: getTableColumns(systemRepoDrizzleSchemas.deploy),
      }).pipe(encodeRpc),
    );
  }

  async pushCommands(props: {
    actorRef: IUserRef;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    commands: readonly IEncodedCommand<IStagedReplicaCommand>[];
  }): Promise<Schema.EitherEncoded<IPushBlock, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      pushCommands({
        db: this.#db,
        actorRef: props.actorRef,
        frontendName: props.frontendName,
        aggregateFrontendLock: props.aggregateFrontendLock,
        commands: props.commands,
        deliveryQueue: this.#deliveryQueue,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        interruptSystemWriteCapture:
          Reflect.get(
            this.env,
            'ZEROSPIN_TEST_INTERRUPT_SYSTEM_WRITE_CAPTURE',
          ) === true,
        selectionTable: systemRepoDrizzleSchemas.selection,
        selectionColumns: getTableColumns(systemRepoDrizzleSchemas.selection),
        storage: this.ctx.storage,
        systemWriteTable: systemRepoDrizzleSchemas.systemWrites,
        systemWriteColumns: getTableColumns(
          systemRepoDrizzleSchemas.systemWrites,
        ),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async finalizeAggregateCommands(props: {
    aggregateName: string;
    aggregateId: string;
    commands: readonly IEncodedCommand<IAggregateCommand>[];
  }): Promise<
    Schema.EitherEncoded<
      Schema.Schema.Type<typeof AggregateFinalizationReceiptSchema>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      finalizeAggregateCommands({
        db: this.#db,
        aggregateName: props.aggregateName,
        aggregateId: props.aggregateId,
        commands: props.commands,
        deliveryQueue: this.#deliveryQueue,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        interruptSystemWriteCapture:
          Reflect.get(
            this.env,
            'ZEROSPIN_TEST_INTERRUPT_SYSTEM_WRITE_CAPTURE',
          ) === true,
        selectionTable: systemRepoDrizzleSchemas.selection,
        selectionColumns: getTableColumns(systemRepoDrizzleSchemas.selection),
        storage: this.ctx.storage,
        systemWriteTable: systemRepoDrizzleSchemas.systemWrites,
        systemWriteColumns: getTableColumns(
          systemRepoDrizzleSchemas.systemWrites,
        ),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async finalizeServiceCommands(props: {
    serviceName: string;
    commands: readonly IEncodedCommand<IServiceCommand>[];
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        executedCommands: readonly IEncodedCommand<IExecutedServiceCommand>[];
        failedCommands: readonly IEncodedCommand<IFailedServiceCommand>[];
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      finalizeServiceCommands({
        db: this.#db,
        serviceName: props.serviceName,
        commands: props.commands,
        deliveryQueue: this.#deliveryQueue,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        interruptSystemWriteCapture:
          Reflect.get(
            this.env,
            'ZEROSPIN_TEST_INTERRUPT_SYSTEM_WRITE_CAPTURE',
          ) === true,
        selectionTable: systemRepoDrizzleSchemas.selection,
        selectionColumns: getTableColumns(systemRepoDrizzleSchemas.selection),
        storage: this.ctx.storage,
        systemWriteTable: systemRepoDrizzleSchemas.systemWrites,
        systemWriteColumns: getTableColumns(
          systemRepoDrizzleSchemas.systemWrites,
        ),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  override async alarm(): Promise<void> {
    await this.#runtime.runPromise(
      alarm({
        drainSystemWrites: alarmProps =>
          drainSystemWrites({
            ...alarmProps,
            db: this.#db,
            deliveryQueue: this.#deliveryQueue,
            generationStateTable: systemRepoDrizzleSchemas.generationState,
            generationStateColumns: getTableColumns(
              systemRepoDrizzleSchemas.generationState,
            ),
            interruptSystemWriteCapture:
              Reflect.get(
                this.env,
                'ZEROSPIN_TEST_INTERRUPT_SYSTEM_WRITE_CAPTURE',
              ) === true,
            storage: this.ctx.storage,
            systemWriteTable: systemRepoDrizzleSchemas.systemWrites,
            systemWriteColumns: getTableColumns(
              systemRepoDrizzleSchemas.systemWrites,
            ),
          }),
        resumeActivation: () =>
          Effect.gen(this, function* () {
            const selection = yield* Effect.try({
              try: () =>
                this.#db
                  .select({
                    activatingDeployId:
                      systemRepoDrizzleSchemas.selection.activatingDeployId,
                  })
                  .from(systemRepoDrizzleSchemas.selection)
                  .get(),
              catch: ZerospinError.catch({
                code: 'system-alarm-selection-read-failed',
                message:
                  'Failed to read the activating deploy during SystemRepo alarm',
              }),
            });
            if (
              selection === undefined ||
              selection.activatingDeployId === null
            ) {
              return;
            }
            const activatingDeployId = selection.activatingDeployId;
            yield* Effect.tryPromise({
              try: () => this.#scheduleActivation(activatingDeployId),
              catch: error =>
                ZerospinError.isZerospinError(error)
                  ? error
                  : new ZerospinError({
                      code: 'system-alarm-activation-resume-failed',
                      message:
                        'SystemRepo alarm failed to resume generation activation',
                      cause: ZerospinError.prettyUnknownFailure(error),
                      extra: {
                        deployId: activatingDeployId,
                      },
                    }),
            });
          }),
      }).pipe(Effect.provide(AsyncLive)),
    );
  }

  async getAggregateIds(props: {
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly InferIdFromAbbreviation[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      getAggregateIds({
        db: this.#db,
        aggregateTable: systemRepoDrizzleSchemas.aggregates,
        generationId: props.generationId,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getGenerationState(props: { generationId: string }) {
    return managedRuntime.runPromise(
      getGenerationState({
        db: this.#db,
        generationId: props.generationId,
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
    generationId: string;
    mode: 'read' | 'write';
  }) {
    return managedRuntime.runPromise(
      assertGenerationAdmission({
        db: this.#db,
        generationId: props.generationId,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        mode: props.mode,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async resolveFrontendProjectionLineage(props: {
    generationId: string;
    target:
      | Readonly<{
          kind: 'aggregate';
          aggregateId: IAggregateId;
          aggregateName: string;
          userId: string;
          frontendName: string;
        }>
      | Readonly<{
          kind: 'service';
          serviceName: string;
          userId: string;
          frontendName: string;
        }>;
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
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
        generationId: props.generationId,
        target: props.target,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async createAggregateFrontendWebSocketTicket(props: {
    generationId: string;
    repoName: string;
    aggregateId: IAggregateId;
    aggregateName: string;
    userId: string;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  }) {
    return managedRuntime.runPromise(
      createAggregateFrontendWebSocketTicket({
        db: this.#db,
        generationId: props.generationId,
        repoName: props.repoName,
        aggregateId: props.aggregateId,
        aggregateName: props.aggregateName,
        userId: props.userId,
        frontendName: props.frontendName,
        aggregateFrontendLock: props.aggregateFrontendLock,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        aggregateFrontendWebSocketTicketTable:
          systemRepoDrizzleSchemas.aggregateFrontendWebSocketTickets,
        aggregateFrontendWebSocketTicketColumns: getTableColumns(
          systemRepoDrizzleSchemas.aggregateFrontendWebSocketTickets,
        ),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async consumeAggregateFrontendWebSocketTicket(props: { ticket: string }) {
    return managedRuntime.runPromise(
      consumeAggregateFrontendWebSocketTicket({
        db: this.#db,
        ticket: props.ticket,
        generationStateTable: systemRepoDrizzleSchemas.generationState,
        generationStateColumns: getTableColumns(
          systemRepoDrizzleSchemas.generationState,
        ),
        aggregateFrontendWebSocketTicketTable:
          systemRepoDrizzleSchemas.aggregateFrontendWebSocketTickets,
        aggregateFrontendWebSocketTicketColumns: getTableColumns(
          systemRepoDrizzleSchemas.aggregateFrontendWebSocketTickets,
        ),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async createServiceFrontendWebSocketTicket(props: {
    generationId: string;
    repoName: string;
    serviceName: string;
    userId: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  }): Promise<Schema.EitherEncoded<string, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      createServiceFrontendWebSocketTicket({
        db: this.#db,
        generationId: props.generationId,
        repoName: props.repoName,
        serviceName: props.serviceName,
        userId: props.userId,
        frontendName: props.frontendName,
        serviceFrontendLock: props.serviceFrontendLock,
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
        generationId: string;
        repoName: string;
        serviceName: string;
        userId: string;
        frontendName: string;
        serviceFrontendLock: Schema.Schema.Type<
          typeof ServiceFrontendLockSchema
        >;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      consumeServiceFrontendWebSocketTicket({
        db: this.#db,
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

  async upsertAggregate(props: {
    aggregateId: string;
    generationId: string;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    const { aggregateId } = props;
    return managedRuntime.runPromise(
      upsertAggregate({
        db: this.#db,
        aggregateTable: systemRepoDrizzleSchemas.aggregates,
        aggregateId,
        generationId: props.generationId,
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
    generationId: string;
    frontendRepo: {
      repoType: 'AggregateFrontendRepo' | 'ServiceFrontendRepo';
      repoName: string;
      tableNames: readonly string[];
    };
    frontendBlockRepo: {
      repoType: 'AggregateFrontendBlockRepo' | 'ServiceFrontendBlockRepo';
      repoName: string;
      tableNames: readonly string[];
    };
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      registerRepos({
        db: this.#db,
        generationId: props.generationId,
        repoTable: systemRepoDrizzleSchemas.repos,
        frontendRepo: props.frontendRepo,
        frontendBlockRepo: props.frontendBlockRepo,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getRepoRegistrations(props: {
    generationId: string;
    repoType: IRepoType;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      getRepoRegistrations({
        db: this.#db,
        generationId: props.generationId,
        repoTable: systemRepoDrizzleSchemas.repos,
        repoType: props.repoType,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getRepoTableRows(props: {
    generationId: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      getRepoTableRows({
        db: this.#db,
        schema: systemRepoDbConfig.schema,
        generationId: props.generationId,
        tableName: props.tableName,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
}
