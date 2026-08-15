/*
 * AggregateFrontendRepo owns one aggregate actor/frontend projection from ordered aggregate blocks.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import type {} from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { PushBlockSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IEncodedCommand,
  IExecutedPushedCommand,
  IFailedPushedCommand,
  IFailedStagedReplicaCommand,
  IFinalizedFailedStagedReplicaCommand,
  IPushBlock,
  IPushedCommand,
  IStagedReplicaCommand,
} from '@zerospin/core/contracts/types';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/makeDrizzleSchemas';
import { migrateDb } from '@zerospin/core/drizzle/migrateDb';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { makeTable } from '@zerospin/core/models/makeTable';
import { PrimitiveKind } from '@zerospin/core/models/primitiveKind';
import { primitives } from '@zerospin/core/models/primitives';
import type {
  IAggregateCursor,
  IAnyShape,
  IAnyTables,
  IModels,
  IShape,
} from '@zerospin/core/models/types';
import { AggregateFrontendBlockSchema } from '@zerospin/core/session/AggregateFrontendBlockSchema';
import type { IAggregateFrontendSyncState } from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ZerospinError, type IAnyErrorJson } from '@zerospin/error';
import {
  makeRpcHandler,
  type IRpcEnvelope,
  type IRpcRequest,
} from '@zerospin/logger';
import { Cause, Effect, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import { system } from 'system';

import { makeBoundDORepo } from '../makeBoundDORepo/makeBoundDORepo.js';
import { makeBoundDORepoConfig } from '../makeBoundDORepo/makeBoundDORepoConfig.js';
import { makeDeliveryQueue } from '../makeDeliveryQueue/makeDeliveryQueue.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';
import type { IAggregateBlock } from '../types.js';

import { alarm } from './alarm/alarm.js';
import { drainAggregateFrontendBlockOutbox } from './drainAggregateFrontendBlockOutbox/drainAggregateFrontendBlockOutbox.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { drainPushBlockOutbox } from './drainPushBlockOutbox/drainPushBlockOutbox.js';
import { getProjectionReadiness } from './getProjectionReadiness/getProjectionReadiness.js';
import { getState } from './getState/getState.js';
import { handleAggregateBlocks } from './handleAggregateBlocks/handleAggregateBlocks.js';
import { prepareSuccessor } from './prepareSuccessor/prepareSuccessor.js';
import { pushCommands } from './pushCommands/pushCommands.js';

const aggregateFrontendRepoPushedCommandShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  systemName: primitives.text(),
  contractVersion: primitives.text(),
  commandType: primitives.enum({ values: ['frontend'] }),
  aggregateId: primitives.text(),
  aggregateName: primitives.text(),
  frontendName: primitives.text(),
  userId: primitives.text(),
  sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
  stagedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.stagedCursor,
  }),
  stagedAt: primitives.date(),
  replicaIndex: primitives.integer(),
  status: primitives.enum({ values: ['pushed'] }),
  pushedAt: primitives.date(),
  pushedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.pushedCursor,
  }),
} satisfies IShape;

const aggregateFrontendRepoTables = {
  graph: makeTable({
    name: 'graph',
    shape: {
      resourceId: primitives.text({ unique: true }),
      modelName: primitives.text(),
    },
    indexes: [
      {
        name: 'aggregateFrontendRepo_graph_resourceId_unique',
        columns: ['resourceId'],
        unique: true,
      },
    ],
  }),
  aggregateSourceGraph: makeTable({
    name: 'aggregateSourceGraph',
    shape: {
      resourceId: primitives.text({ unique: true }),
      modelName: primitives.text(),
    },
    indexes: [
      {
        name: 'aggregateSourceGraph_resourceId_unique',
        columns: ['resourceId'],
        unique: true,
      },
    ],
  }),
  pushedCommands: makeTable({
    name: 'pushedCommands',
    shape: aggregateFrontendRepoPushedCommandShape,
  }),
  executedPushedCommands: makeTable({
    name: 'executedPushedCommands',
    shape: {
      id: primitives.primaryKey({ abbreviation: 'cmd' }),
      commandName: primitives.text(),
      payload: primitives.text(),
      systemName: primitives.text(),
      contractVersion: primitives.text(),
      commandType: primitives.enum({ values: ['frontend'] }),
      aggregateId: primitives.text(),
      aggregateName: primitives.text(),
      frontendName: primitives.text(),
      userId: primitives.text(),
      sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
      stagedCursor: primitives.cursor({
        abbreviation: coreAbbreviations.stagedCursor,
      }),
      stagedAt: primitives.date(),
      replicaIndex: primitives.integer(),
      pushedAt: primitives.date(),
      pushedCursor: primitives.cursor({
        abbreviation: coreAbbreviations.pushedCursor,
      }),
      mode: primitives.enum({
        values: ['authoritative', 'optimistic-lww'],
      }),
      aggregateCursor: primitives.cursor({
        abbreviation: coreAbbreviations.aggregateCursor,
      }),
      aggregateIndex: primitives.integer(),
      executedAt: primitives.date(),
      status: primitives.enum({ values: ['executed'] }),
    },
  }),
  failedStagedCommands: makeTable({
    name: 'failedStagedCommands',
    shape: {
      id: primitives.primaryKey({ abbreviation: 'cmd' }),
      commandName: primitives.text(),
      payload: primitives.text(),
      systemName: primitives.text(),
      contractVersion: primitives.text(),
      commandType: primitives.enum({ values: ['frontend'] }),
      aggregateId: primitives.text(),
      aggregateName: primitives.text(),
      frontendName: primitives.text(),
      userId: primitives.text(),
      sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
      stagedCursor: primitives.cursor({
        abbreviation: coreAbbreviations.stagedCursor,
      }),
      stagedAt: primitives.date(),
      replicaIndex: primitives.integer(),
      pushedCursor: primitives.cursor({
        abbreviation: coreAbbreviations.pushedCursor,
        nullable: true,
      }),
      aggregateCursor: primitives.cursor({
        abbreviation: coreAbbreviations.aggregateCursor,
        nullable: true,
      }),
      aggregateIndex: primitives.integer({ nullable: true }),
      failedAt: primitives.date(),
      failure: primitives.text(),
      status: primitives.enum({ values: ['failed'] }),
    },
  }),
  failedPushedCommands: makeTable({
    name: 'failedPushedCommands',
    shape: {
      id: primitives.primaryKey({ abbreviation: 'cmd' }),
      commandName: primitives.text(),
      payload: primitives.text(),
      systemName: primitives.text(),
      contractVersion: primitives.text(),
      commandType: primitives.enum({ values: ['frontend'] }),
      aggregateId: primitives.text(),
      aggregateName: primitives.text(),
      frontendName: primitives.text(),
      userId: primitives.text(),
      sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
      stagedCursor: primitives.cursor({
        abbreviation: coreAbbreviations.stagedCursor,
      }),
      stagedAt: primitives.date(),
      replicaIndex: primitives.integer(),
      pushedAt: primitives.date(),
      pushedCursor: primitives.cursor({
        abbreviation: coreAbbreviations.pushedCursor,
      }),
      aggregateCursor: primitives.cursor({
        abbreviation: coreAbbreviations.aggregateCursor,
      }),
      aggregateIndex: primitives.integer(),
      failedAt: primitives.date(),
      failure: primitives.text(),
      status: primitives.enum({ values: ['failed'] }),
    },
  }),
  pushedMutations: makeTable({
    name: 'pushedMutations',
    shape: {
      commandId: primitives.text(),
      mutationIndex: primitives.integer(),
      modelName: primitives.text(),
      modelVersion: primitives.text(),
      resourceId: primitives.text(),
      operationName: primitives.enum({
        values: ['create', 'delete', 'move', 'replicateResource', 'update'],
      }),
      operation: primitives.text(),
      appliedAt: primitives.date(),
      lastAppliedAt: primitives.date({ nullable: true }),
      inverseOperation: primitives.text(),
    },
    indexes: [
      {
        name: 'aggregateFrontendRepo_pushedMutations_command_mutation_unique',
        columns: ['commandId', 'mutationIndex'],
        unique: true,
      },
    ],
  }),
  pushBlockOutbox: makeTable({
    name: 'pushBlockOutbox',
    shape: {
      writeIndex: primitives.integer({ primaryKey: true }),
      requestBytes: primitives.text(),
      block: primitives.json({ schema: PushBlockSchema }),
      finalizedAt: primitives.date({ nullable: true }),
      failure: primitives.json({
        schema: ZerospinError.schema,
        nullable: true,
      }),
    },
  }),
  aggregateFrontendBlockOutbox: makeTable({
    name: 'aggregateFrontendBlockOutbox',
    shape: {
      frontendIndex: primitives.integer({ unique: true }),
      block: primitives.json({ schema: AggregateFrontendBlockSchema }),
      publishedAt: primitives.date({ nullable: true }),
      failure: primitives.json({
        schema: ZerospinError.schema,
        nullable: true,
      }),
    },
  }),
} satisfies IAnyTables;

export const aggregateFrontendRepoDrizzleSchemas =
  makeDrizzleSchemasRecordFromTables(aggregateFrontendRepoTables);

const aggregateFrontendBoundDORepoConfig = makeBoundDORepoConfig({
  abbreviation: systemWorkerAbbreviations.aggregateFrontendRepo,
  namePattern: RoutePattern.parse(
    '/:generationId/:aggregateId/:aggregateName/:userId/:frontendName',
  ),
  managedRuntime,
  getDbConfig: Effect.fn('AggregateFrontendRepo.getDbConfig')(function* ({
    key,
    storage,
  }) {
    const pushedCommandColumns = [
      ...storage.sql.exec<{ name: string }>(
        'PRAGMA table_info(pushedCommands)',
      ),
    ];
    const pushBlockOutboxColumns = [
      ...storage.sql.exec<{ name: string }>(
        'PRAGMA table_info(pushBlockOutbox)',
      ),
    ];
    const failedStagedCommandColumns = [
      ...storage.sql.exec<{ name: string }>(
        'PRAGMA table_info(failedStagedCommands)',
      ),
    ];
    const pushBlockOutboxColumnNames = new Set(
      pushBlockOutboxColumns.map(column => column.name),
    );
    const failedStagedCommandColumnNames = new Set(
      failedStagedCommandColumns.map(column => column.name),
    );
    const hasCommandPersistence =
      pushedCommandColumns.length > 0 ||
      pushBlockOutboxColumns.length > 0 ||
      failedStagedCommandColumns.length > 0 ||
      storage.kv.get('initialized') === true;
    const commandSchemaReceipt = storage.kv.get(
      'aggregateFrontendCommandSchemaReceipt',
    );
    if (
      hasCommandPersistence &&
      (commandSchemaReceipt !== 'replica-push-command-schema-v1' ||
        ['writeIndex', 'requestBytes', 'block', 'finalizedAt', 'failure'].some(
          column => !pushBlockOutboxColumnNames.has(column),
        ) ||
        !pushedCommandColumns.some(column => column.name === 'replicaIndex') ||
        [
          'id',
          'commandName',
          'payload',
          'systemName',
          'contractVersion',
          'commandType',
          'aggregateId',
          'aggregateName',
          'frontendName',
          'userId',
          'sessionId',
          'stagedCursor',
          'stagedAt',
          'replicaIndex',
          'pushedCursor',
          'aggregateCursor',
          'aggregateIndex',
          'failedAt',
          'failure',
          'status',
        ].some(column => !failedStagedCommandColumnNames.has(column)))
    ) {
      return yield* new ZerospinError({
        code: 'legacy-aggregate-frontend-repo-persistence-reset-required',
        message:
          'AggregateFrontendRepo contains incompatible command persistence and must be reset before this code can run',
        extra: {
          aggregateId: key.aggregateId,
          aggregateName: key.aggregateName,
          userId: key.userId,
          frontendName: key.frontendName,
        },
      });
    }

    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: key.aggregateName,
      recordKind: 'aggregates',
    });
    const aggregateModels: IModels = aggregate.models;
    const frontendBinding = yield* getByKeyOrThrow({
      record: aggregate.frontends,
      key: key.frontendName,
      recordKind: `frontends owned by aggregate ${key.aggregateName}`,
    });

    const projectionTables: IAnyTables = {};
    for (const model of Object.values(frontendBinding.controller.models)) {
      projectionTables[model.modelName] = model.table;
    }

    const aggregateSourceTables: IAnyTables = {};
    const aggregateSourceShapes: Record<string, IAnyShape> = {};
    const physicalTableNames: Record<string, string> = {};
    for (const model of Object.values(aggregateModels)) {
      const sourceTableKey = `aggregateSource_${model.modelName}`;
      const sourceShape: IAnyShape = {};
      aggregateSourceShapes[model.modelName] = sourceShape;
      aggregateSourceTables[sourceTableKey] = {
        ...model.table,
        shape: sourceShape,
      };
      physicalTableNames[sourceTableKey] = sourceTableKey;
    }

    for (const model of Object.values(aggregateModels)) {
      const sourceShape = aggregateSourceShapes[model.modelName];
      if (sourceShape === undefined) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-aggregate-source-shape-missing',
          message: `AggregateFrontendRepo source shape for aggregate model "${model.modelName}" is missing`,
        });
      }
      const modelShape: IAnyShape = model.table.shape;
      for (const [propertyName, descriptor] of Object.entries(modelShape)) {
        if (descriptor.kind !== PrimitiveKind.Ref) {
          sourceShape[propertyName] = descriptor;
          continue;
        }
        const targetModel = aggregateModels[descriptor.targetTableName];
        const targetSourceTable =
          aggregateSourceTables[
            `aggregateSource_${descriptor.targetTableName}`
          ];
        if (
          targetModel === undefined ||
          targetModel.table !== descriptor.table ||
          targetSourceTable === undefined
        ) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-aggregate-source-ref-target-missing',
            message: `AggregateFrontendRepo source ref ${model.modelName}.${propertyName} targets an unregistered aggregate model table`,
            extra: {
              aggregateName: key.aggregateName,
              modelName: model.modelName,
              propertyName,
              targetTableName: descriptor.targetTableName,
            },
          });
        }
        sourceShape[propertyName] = {
          ...descriptor,
          table: targetSourceTable,
        };
      }
    }

    return makeDbConfig({
      tables: {
        ...projectionTables,
        ...aggregateFrontendRepoTables,
        ...aggregateSourceTables,
      },
      physicalTableNames,
    });
  }),
});

export class AggregateFrontendRepo extends makeBoundDORepo({
  boundDORepoConfig: aggregateFrontendBoundDORepoConfig,
}) {
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly boundDORepoConfig =
    aggregateFrontendBoundDORepoConfig;

  private readonly deliveryQueue = makeDeliveryQueue({
    hasPending: () =>
      Effect.sync(
        () =>
          this.db
            .select()
            .from(aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox)
            .all()
            .some(row => row.finalizedAt === null) ||
          this.db
            .select()
            .from(
              aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox,
            )
            .all()
            .some(row => row.publishedAt === null),
      ),
    storage: this.ctx.storage,
  });

  constructor(ctx: DurableObjectState, workerEnv: Cloudflare.Env) {
    super(ctx, workerEnv);

    ctx.blockConcurrencyWhile(() =>
      managedRuntime.runPromise(
        Effect.gen(this, function* () {
          yield* Effect.promise(() => this.boundDORepoInitialization);
          yield* migrateDb({ db: this.db, schema: this.schema });
          yield* Effect.sync(() => {
            this.ctx.storage.kv.put(
              'aggregateFrontendCommandSchemaReceipt',
              'replica-push-command-schema-v1',
            );
          });
        }).pipe(Effect.provide(AsyncLive)),
      ),
    );
  }

  async handleAggregateBlocks(
    request: IRpcRequest<[{ blocks: readonly IAggregateBlock[] }]>,
  ): Promise<IRpcEnvelope<void, IAnyErrorJson>> {
    const db = this.db;
    const aggregateFrontendRepoSchema = this.schema;
    const key = this.key;
    const storage = this.ctx.storage;
    const envelope = await this.ctx.blockConcurrencyWhile(() =>
      managedRuntime.runPromise(
        makeRpcHandler('AggregateFrontendRepo.handleAggregateBlocks.rpc')(
          function* (props: { blocks: readonly IAggregateBlock[] }) {
            return yield* handleAggregateBlocks({
              ...props,
              db,
              aggregateFrontendRepoSchema,
              key,
              storage,
            }).pipe(
              Effect.provide(AsyncLive),
              Effect.mapError(error =>
                Schema.encodeSync(ZerospinError.schema)(
                  Cause.originalError(error),
                ),
              ),
            );
          },
        )(request),
      ),
    );
    this.ctx.waitUntil(
      Promise.all([
        this.drainAggregateFrontendBlockOutbox(),
        this.drainPushBlockOutbox(),
      ]).then(
        () => undefined,
        () => undefined,
      ),
    );
    return envelope;
  }

  async pushCommands(props: {
    writeIndex: number;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    commands: readonly IEncodedCommand<IStagedReplicaCommand>[];
  }): Promise<Schema.EitherEncoded<IPushBlock, IAnyErrorJson>> {
    const encoded = await this.ctx.blockConcurrencyWhile(() =>
      managedRuntime.runPromise(
        pushCommands({
          ...props,
          configuredSystemId: this.env.ZEROSPIN_SYSTEM_ID,
          db: this.db,
          aggregateFrontendRepoSchema: this.schema,
          key: this.key,
          name: this.ctx.id.name ?? '',
          storage: this.ctx.storage,
        }).pipe(Effect.provide(AsyncLive), encodeRpc),
      ),
    );
    this.ctx.waitUntil(
      this.drainPushBlockOutbox().then(
        () => undefined,
        () => undefined,
      ),
    );
    return encoded;
  }

  async getState(props: {
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
    lineage: Readonly<{
      predecessor: Readonly<{
        generationId: string;
        repoName: string;
        terminalFrontendIndex: number;
      }> | null;
    }>;
  }): Promise<
    Schema.EitherEncoded<IAggregateFrontendSyncState, IAnyErrorJson>
  > {
    const encoded = await this.ctx.blockConcurrencyWhile(() =>
      managedRuntime.runPromise(
        getState({
          ...props,
          configuredSystemId: this.env.ZEROSPIN_SYSTEM_ID,
          db: this.db,
          aggregateFrontendRepoSchema: this.schema,
          key: this.key,
          name: this.ctx.id.name ?? '',
          storage: this.ctx.storage,
        }).pipe(Effect.provide(AsyncLive), encodeRpc),
      ),
    );
    this.ctx.waitUntil(
      Promise.all([
        this.drainAggregateFrontendBlockOutbox(),
        this.drainPushBlockOutbox(),
      ]).then(
        () => undefined,
        () => undefined,
      ),
    );
    return encoded;
  }

  async getProjectionReadiness(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        generationId: string;
        lastAggregateCursor: string | null;
        aggregateIndex: number | null;
        frontendIndex: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getProjectionReadiness({
        db: this.db,
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async prepareSuccessor(props: {
    lastAggregateCursor: IAggregateCursor | null;
    aggregateIndex: number | null;
    predecessor: Readonly<{
      generationId: string;
      repoName: string;
      terminalFrontendIndex: number;
    }>;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return this.ctx.blockConcurrencyWhile(() =>
      managedRuntime.runPromise(
        prepareSuccessor({
          ...props,
          configuredSystemId: this.env.ZEROSPIN_SYSTEM_ID,
          db: this.db,
          aggregateFrontendRepoSchema: this.schema,
          key: this.key,
          name: this.ctx.id.name ?? '',
          storage: this.ctx.storage,
        }).pipe(Effect.provide(AsyncLive), encodeRpc),
      ),
    );
  }

  async drainAggregateFrontendBlockOutbox(): Promise<
    Schema.EitherEncoded<void, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      drainAggregateFrontendBlockOutbox({
        configuredSystemId: this.env.ZEROSPIN_SYSTEM_ID,
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainPushBlockOutbox(): Promise<
    Schema.EitherEncoded<void, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      drainPushBlockOutbox({
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        key: this.key,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainGeneration(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        pendingPushBlockCount: number;
        pendingFrontendBlockCount: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      drainGeneration({
        configuredSystemId: this.env.ZEROSPIN_SYSTEM_ID,
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    await managedRuntime.runPromise(
      alarm({
        configuredSystemId: this.env.ZEROSPIN_SYSTEM_ID,
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive)),
    );
  }
}
