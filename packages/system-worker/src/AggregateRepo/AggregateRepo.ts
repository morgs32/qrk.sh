/*
 * System-worker annotation:
 * Defines the AggregateRepo Durable Object shell and local storage wiring.
 * Public RPC/lifecycle methods should delegate to same-named Effect functions instead of growing inline workflow bodies here.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import type {} from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedExecutedAggregateCommandSchema,
  EncodedFailedAggregateCommandSchema,
  ExecutedPushedCommandSchema,
  FinalizedFailedStagedReplicaCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type {
  IAggregateCommand,
  IEncodedCommand,
  IPushBlock,
} from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/makeDrizzleSchemas';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type {
  IAggregateCursor,
  IAnyTables,
  InferDecodedRow,
  IServiceCursorId,
  IShape,
} from '@zerospin/core/models/types';
import type { IEncodedQuery } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ZerospinError, type IAnyErrorJson } from '@zerospin/error';
import {
  makeRpcHandler,
  type IRpcEnvelope,
  type IRpcRequest,
} from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import { Cause, Effect, Either, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import { system } from 'system';
import { assert, type Equals } from 'tsafe';

import { AggregateFinalizationReceiptSchema } from '../blockSchemas.js';
import { makeBoundDORepo } from '../makeBoundDORepo/makeBoundDORepo.js';
import { makeBoundDORepoConfig } from '../makeBoundDORepo/makeBoundDORepoConfig.js';
import { makeDeliveryQueue } from '../makeDeliveryQueue/makeDeliveryQueue.js';
import { managedRuntime } from '../managedRuntime.js';
import { ServiceRepo } from '../ServiceRepo/ServiceRepo.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';
import type {
  IAggregateBlock,
  IAggregateBlockOutboxRecord,
  IServiceBlock,
} from '../types.js';

import { alarm } from './alarm/alarm.js';
import { authorizeAggregateFrontend } from './authorizeAggregateFrontend/authorizeAggregateFrontend.js';
import { drainAggregateOutboxes } from './drainAggregateOutboxes/drainAggregateOutboxes.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { executeSelectQuery } from './executeSelectQuery/executeSelectQuery.js';
import { finalizeAggregateCommands } from './finalizeAggregateCommands/finalizeAggregateCommands.js';
import { finalizePushBlock } from './finalizePushBlock/finalizePushBlock.js';
import { getReplaySubscriptions } from './getReplaySubscriptions/getReplaySubscriptions.js';
import { handleServiceBlocks } from './handleServiceBlocks/handleServiceBlocks.js';
import { replayAggregateBlock } from './replayAggregateBlock/replayAggregateBlock.js';
import { restoreReplaySubscription } from './restoreReplaySubscription/restoreReplaySubscription.js';

const blockOutbox = Object.freeze({
  writeIndex: primitives.integer({ unique: true }),
  lastAggregateCursor: primitives.primaryKey({
    abbreviation: coreAbbreviations.aggregateCursor,
  }),
  aggregateIndex: primitives.integer({ unique: true }),
  executedCommands: primitives.json({
    schema: Schema.Array(
      Schema.Union(
        EncodedExecutedAggregateCommandSchema,
        ExecutedPushedCommandSchema,
      ),
    ),
  }),
  failedCommands: primitives.json({
    schema: Schema.Array(
      Schema.Union(
        EncodedFailedAggregateCommandSchema,
        FinalizedFailedStagedReplicaCommandSchema,
        FailedPushedCommandSchema,
      ),
    ),
  }),
  appliedMutations: primitives.json({
    schema: Schema.Array(EncodedAppliedMutationSchema),
  }),
  publishedAt: primitives.date({ nullable: true }),
  failure: primitives.json({ schema: ZerospinError.schema, nullable: true }),
} satisfies IShape);

assert<
  Equals<InferDecodedRow<typeof blockOutbox>, IAggregateBlockOutboxRecord>
>();

const aggregateRepoTables = {
  aggregateBlockOutbox: makeTable({
    name: 'aggregateBlockOutbox',
    shape: blockOutbox,
    indexes: [
      {
        name: 'aggregateBlockOutbox_aggregateIndex_unique',
        columns: ['aggregateIndex'],
        unique: true,
      },
      {
        name: 'aggregateBlockOutbox_writeIndex_unique',
        columns: ['writeIndex'],
        unique: true,
      },
    ],
  }),
  aggregateCommandOutcomes: makeTable({
    name: 'aggregateCommandOutcomes',
    shape: {
      commandId: primitives.primaryKey({ abbreviation: 'cmd' }),
      commandBytes: primitives.text(),
      command: primitives.json({
        schema: Schema.Union(
          EncodedExecutedAggregateCommandSchema,
          ExecutedPushedCommandSchema,
          EncodedFailedAggregateCommandSchema,
          FinalizedFailedStagedReplicaCommandSchema,
          FailedPushedCommandSchema,
        ),
      }),
      aggregateCursor: primitives.cursor({
        abbreviation: coreAbbreviations.aggregateCursor,
      }),
      aggregateIndex: primitives.integer({ unique: true }),
      appliedMutations: primitives.json({
        schema: Schema.Array(EncodedAppliedMutationSchema),
      }),
      writeIndex: primitives.integer(),
    },
    indexes: [
      {
        name: 'aggregateCommandOutcomes_aggregateIndex_unique',
        columns: ['aggregateIndex'],
        unique: true,
      },
    ],
  }),
  serviceSubscriptions: makeTable({
    name: 'serviceSubscriptions',
    shape: {
      serviceRepoName: primitives.primaryKey({
        abbreviation: systemWorkerAbbreviations.serviceRepo,
      }),
      serviceName: primitives.text(),
      currentServiceCursor: primitives.cursor({
        abbreviation: coreAbbreviations.serviceCursor,
      }),
      currentServiceIndex: primitives.integer(),
      subscribedAt: primitives.date({ nullable: true }),
      failure: primitives.json({
        schema: ZerospinError.schema,
        nullable: true,
      }),
    },
  }),
  aggregateReplayReceipts: makeTable({
    name: 'aggregateReplayReceipts',
    shape: {
      prevGenerationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
      }),
      writeIndex: primitives.integer(),
      sourceBlockBytes: primitives.text(),
      targetBlockBytes: primitives.text(),
      sourceAggregateIndex: primitives.integer(),
      lastAggregateCursor: primitives.cursor({
        abbreviation: coreAbbreviations.aggregateCursor,
      }),
      appliedMutationCount: primitives.integer(),
      discardedMutationCount: primitives.integer(),
      completedAt: primitives.date(),
    },
    indexes: [
      {
        name: 'aggregateReplayReceipts_generation_index_unique',
        columns: ['prevGenerationId', 'sourceAggregateIndex'],
        unique: true,
      },
      {
        name: 'aggregateReplayReceipts_sourceAggregateIndex_idx',
        columns: ['sourceAggregateIndex'],
      },
    ],
  }),
} satisfies IAnyTables;

export const aggregateRepoDrizzleSchemas =
  makeDrizzleSchemasRecordFromTables(aggregateRepoTables);

const aggregateBoundDORepoConfig = makeBoundDORepoConfig({
  abbreviation: systemWorkerAbbreviations.aggregateRepo,
  repoType: 'AggregateRepo',
  namePattern: RoutePattern.parse('/:generationId/:aggregateId/:aggregateName'),
  managedRuntime,
  getDbConfig: Effect.fn('AggregateRepo.getDbConfig')(function* (props) {
    const { key, storage } = props;

    const blockOutboxColumns = [
      ...storage.sql.exec<{ name: string }>(
        'PRAGMA table_info(aggregateBlockOutbox)',
      ),
    ].map(column => column.name);
    const outcomeColumns = [
      ...storage.sql.exec<{ name: string }>(
        'PRAGMA table_info(aggregateCommandOutcomes)',
      ),
    ].map(column => column.name);
    if (
      (blockOutboxColumns.length > 0 &&
        !blockOutboxColumns.includes('writeIndex')) ||
      (outcomeColumns.length > 0 &&
        [
          'commandId',
          'commandBytes',
          'command',
          'aggregateCursor',
          'aggregateIndex',
          'appliedMutations',
          'writeIndex',
        ].some(column => !outcomeColumns.includes(column)))
    ) {
      return yield* new ZerospinError({
        code: 'legacy-aggregate-repo-outcome-persistence-reset-required',
        message:
          'AggregateRepo contains incompatible block or command-outcome persistence and must be reset before this code can run',
      });
    }

    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: key.aggregateName,
      recordKind: 'aggregates',
    });

    return makeResourceDbConfig({
      models: aggregate.models,
      otherTables: aggregateRepoTables,
    });
  }),
  bootstrap: Effect.fn('AggregateRepo.bootstrap')(function* (props: {
    ctx: DurableObjectState;
    name: string;
    key: {
      generationId: string;
      aggregateId: string;
      aggregateName: string;
    };
    db: unknown;
    schema: unknown;
    relations: unknown;
  }) {
    const { key } = props;
    const { aggregateId } = key;

    /*
     * Register this aggregate id in the SystemRepo for the generation parsed from
     * this AggregateRepo's own name. The SystemRepo write is idempotent
     * (`onConflictDoNothing`), so repeat bootstrap runs can re-announce the
     * aggregate without duplicating registry rows; `decodeRpc` keeps any remote
     * failure inside the Effect bootstrap path.
     */
    yield* makeAsync(() =>
      SystemRepo.getRepo({
        systemId: env.ZEROSPIN_SYSTEM_ID,
      }).upsertAggregate({ aggregateId, generationId: key.generationId }),
    ).pipe(Effect.flatMap(decodeRpc));
  }),
});

/**
 * AggregateRepo Durable Object (one per `aggregateId` + `aggregateName`, `AGGREGATE_REPO` binding).
 *
 * Owns aggregate model resource state, command finalization, and the finalized
 * aggregate-block outbox.
 *
 * Lookup: `getAggregateRepo`.
 */
export class AggregateRepo extends makeBoundDORepo({
  boundDORepoConfig: aggregateBoundDORepoConfig,
}) {
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly boundDORepoConfig = aggregateBoundDORepoConfig;

  private readonly deliveryQueue = makeDeliveryQueue({
    storage: this.ctx.storage,
  });

  /**
   * Runs a select-only encoded SQL query against this aggregate's SQLite adapter.
   *
   * `SystemApi.executeSelectQuery` → `SystemWorker.executeSelectQuery` → here.
   */
  async executeSelectQuery(props: {
    aggregateName: string;
    query: IEncodedQuery;
  }): Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>> {
    const { query } = props;
    return managedRuntime.runPromise(
      executeSelectQuery({
        db: this.db,
        query,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async authorizeAggregateFrontend(props: {
    aggregateId: string;
    aggregateName: string;
    frontendName: string;
    userId: string;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      authorizeAggregateFrontend({
        ...props,
        db: this.db,
      }).pipe(encodeRpc),
    );
  }

  /**
   * Finalizes aggregate commands into a persisted aggregate block.
   * The returned block is the transactionally enqueued AggregateRepo outbox row.
   *
   * 1. Decode the RPC request inside the existing handler.
   * 2. Acquire the coarse AggregateRepo concurrency gate.
   * 3. Prepare snapshots and commit the local finalization while gated.
   * 4. Release the gate with expected failures still encoded in Effect.
   * 5. Drain subscriptions and aggregate-block outboxes after release.
   */
  async finalizeAggregateCommands(
    request: IRpcRequest<
      [
        {
          writeIndex: number;
          aggregateId: string;
          aggregateName: string;
          commands: readonly IEncodedCommand<IAggregateCommand>[];
        },
      ]
    >,
  ): Promise<
    IRpcEnvelope<
      Schema.Schema.Type<typeof AggregateFinalizationReceiptSchema>,
      IAnyErrorJson
    >
  > {
    const db = this.db;
    const key = this.key;
    const aggregateRepoName = this.ctx.id.name ?? '';
    const ctx = this.ctx;
    const deliveryQueue = this.deliveryQueue;
    const storage = this.ctx.storage;
    return managedRuntime.runPromise(
      makeRpcHandler('AggregateRepo.finalizeAggregateCommands.rpc')(
        function* (props: {
          writeIndex: number;
          aggregateId: string;
          aggregateName: string;
          commands: readonly IEncodedCommand<IAggregateCommand>[];
        }) {
          // 1 — makeRpcHandler keeps request and response envelope behavior unchanged
          return yield* Effect.gen(function* () {
            // 2 — block handleServiceBlocks and every other AggregateRepo event before reading service watermarks
            const gated = yield* Effect.promise(() =>
              ctx.blockConcurrencyWhile(() =>
                managedRuntime.runPromise(
                  // 3 — grouped ServiceRepo RPCs and the AggregateRepo transaction complete under the same gate
                  finalizeAggregateCommands({
                    writeIndex: props.writeIndex,
                    generationId: key.generationId,
                    aggregateId: props.aggregateId,
                    aggregateName: props.aggregateName,
                    commands: props.commands,
                    db,
                    key,
                    storage,
                  }).pipe(Effect.either),
                ),
              ),
            );
            // 4 — expected Effect failures leave the gate as values, not uncaught callback exceptions
            if (Either.isLeft(gated)) {
              return yield* gated.left;
            }
            const receipt = gated.right;
            // 5 — publication and ServiceBlockRepo subscription happen only after blockConcurrencyWhile releases
            yield* drainAggregateOutboxes({
              aggregateRepoName,
              generationId: key.generationId,
              aggregateId: key.aggregateId,
              aggregateName: key.aggregateName,
              db,
              deliveryQueue,
              storage,
            });
            return receipt;
          }).pipe(
            Effect.mapError(error =>
              Schema.encodeSync(ZerospinError.schema)(
                Cause.originalError(error),
              ),
            ),
          );
        },
      )(request),
    );
  }

  /**
   * Finalizes one immutable AggregateFrontendRepo pushed block into authoritative
   * aggregate command outcomes. Repeated pushed-block ids return the stored row.
   *
   * 1. Decode the pushed-block request inside the existing handler.
   * 2. Acquire the coarse AggregateRepo concurrency gate.
   * 3. Batch pushed preparation and commit the local transaction while gated.
   * 4. Release the gate with expected failures still encoded in Effect.
   * 5. Drain subscriptions and aggregate-block outboxes after release.
   */
  async finalizePushBlock(
    request: IRpcRequest<[{ pushBlock: IPushBlock }]>,
  ): Promise<IRpcEnvelope<void, IAnyErrorJson>> {
    const db = this.db;
    const key = this.key;
    const aggregateRepoName = this.ctx.id.name ?? '';
    const ctx = this.ctx;
    const deliveryQueue = this.deliveryQueue;
    const storage = this.ctx.storage;
    return managedRuntime.runPromise(
      makeRpcHandler('AggregateRepo.finalizePushBlock.rpc')(function* (props: {
        pushBlock: IPushBlock;
      }) {
        // 1 — makeRpcHandler preserves the pushed RPC envelope and trace boundary
        return yield* Effect.gen(function* () {
          // 2 — no service delivery can interleave after the subscription watermark is read
          const gated = yield* Effect.promise(() =>
            ctx.blockConcurrencyWhile(() =>
              managedRuntime.runPromise(
                // 3 — adapter batching, grouped snapshots, alignment, and pushed outcomes commit together
                finalizePushBlock({
                  generationId: key.generationId,
                  aggregateId: key.aggregateId,
                  aggregateName: key.aggregateName,
                  pushBlock: props.pushBlock,
                  db,
                  storage,
                }).pipe(Effect.either),
              ),
            ),
          );
          // 4 — expected Effect failures are re-entered after the gate releases
          if (Either.isLeft(gated)) {
            return yield* gated.left;
          }
          gated.right;
          // 5 — outbox I/O stays outside the 30-second blockConcurrencyWhile callback
          yield* drainAggregateOutboxes({
            aggregateRepoName,
            generationId: key.generationId,
            aggregateId: key.aggregateId,
            aggregateName: key.aggregateName,
            db,
            deliveryQueue,
            storage,
          });
          return;
        }).pipe(
          Effect.mapError(error =>
            Schema.encodeSync(ZerospinError.schema)(Cause.originalError(error)),
          ),
        );
      })(request),
    );
  }

  async handleServiceBlocks(props: {
    serviceName: string;
    blocks: readonly IServiceBlock[];
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(this, function* () {
        const serviceRepoName =
          yield* ServiceRepo.boundDORepoConfig.nameUtils.makeName({
            generationId: this.key.generationId,
            serviceName: props.serviceName,
          });
        yield* handleServiceBlocks({
          ...props,
          aggregateName: this.key.aggregateName,
          serviceRepoName,
          db: this.db,
          storage: this.ctx.storage,
        });
        yield* drainAggregateOutboxes({
          aggregateRepoName: this.ctx.id.name ?? '',
          generationId: this.key.generationId,
          aggregateId: this.key.aggregateId,
          aggregateName: this.key.aggregateName,
          db: this.db,
          deliveryQueue: this.deliveryQueue,
          storage: this.ctx.storage,
        });
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainAggregateOutboxes(): Promise<
    Schema.EitherEncoded<void, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      drainAggregateOutboxes({
        aggregateRepoName: this.ctx.id.name ?? '',
        generationId: this.key.generationId,
        aggregateId: this.key.aggregateId,
        aggregateName: this.key.aggregateName,
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainGeneration(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        pendingServiceSubscriptionCount: number;
        pendingAggregateBlockCount: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      drainGeneration({
        aggregateId: this.key.aggregateId,
        aggregateName: this.key.aggregateName,
        aggregateRepoName: this.ctx.id.name ?? '',
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        generationId: this.key.generationId,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getReplaySubscriptions(): Promise<
    Schema.EitherEncoded<
      readonly Readonly<{
        serviceRepoName: string;
        serviceName: string;
        currentServiceCursor: IServiceCursorId;
        currentServiceIndex: number;
      }>[],
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getReplaySubscriptions({ db: this.db }).pipe(encodeRpc),
    );
  }

  async restoreReplaySubscription(props: {
    serviceName: string;
    currentServiceCursor: IServiceCursorId;
    currentServiceIndex: number;
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        restored: boolean;
        serviceRepoName: string;
        serviceName: string;
        currentServiceCursor: IServiceCursorId;
        currentServiceIndex: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      restoreReplaySubscription({
        ...props,
        aggregateId: this.key.aggregateId,
        aggregateName: this.key.aggregateName,
        aggregateRepoName: this.ctx.id.name ?? '',
        db: this.db,
        generationId: this.key.generationId,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async replayAggregateBlock(props: {
    prevGenerationId: string;
    block: IAggregateBlock;
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        replayed: boolean;
        lastAggregateCursor: IAggregateCursor;
        aggregateIndex: number;
        appliedMutationCount: number;
        discardedMutationCount: number;
      }>,
      IAnyErrorJson
    >
  > {
    return this.ctx.blockConcurrencyWhile(() =>
      managedRuntime.runPromise(
        replayAggregateBlock({
          ...props,
          aggregateId: this.key.aggregateId,
          aggregateName: this.key.aggregateName,
          aggregateRepoName: this.ctx.id.name ?? '',
          db: this.db,
          deliveryQueue: this.deliveryQueue,
          generationId: this.key.generationId,
          storage: this.ctx.storage,
        }).pipe(Effect.provide(AsyncLive), encodeRpc),
      ),
    );
  }

  async alarm(): Promise<void> {
    await managedRuntime.runPromise(
      alarm({
        aggregateRepoName: this.ctx.id.name ?? '',
        generationId: this.key.generationId,
        aggregateId: this.key.aggregateId,
        aggregateName: this.key.aggregateName,
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive)),
    );
  }
}
