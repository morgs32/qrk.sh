/*
 * System-worker annotation:
 * Defines the AggregateBlockRepo Durable Object shell and storage wiring.
 * It is the concrete aggregate block archive and direct frontend delivery owner.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import type {} from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import type { IAggregateCursor } from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError, type IAnyErrorJson } from '@zerospin/error';
import {
  makeRpcHandler,
  makeTelemetryCollector,
  makeTelemetryLayer,
  TelemetryCollector,
  type IRpcEnvelope,
  type IRpcRequest,
} from '@zerospin/logger';
import { Cause, Effect, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import { makeBoundDORepo } from '../makeBoundDORepo/makeBoundDORepo.js';
import { makeBoundDORepoConfig } from '../makeBoundDORepo/makeBoundDORepoConfig.js';
import { makeDeliveryQueue } from '../makeDeliveryQueue/makeDeliveryQueue.js';
import { managedRuntime } from '../managedRuntime.js';
import { getSystemLogRepo } from '../SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';
import type { IAggregateBlock } from '../types.js';

import { aggregateBlockTables } from './aggregateBlockDrizzleSchemas.js';
import { alarm } from './alarm/alarm.js';
import { drainAggregateFrontendOutbox } from './drainAggregateFrontendOutbox/drainAggregateFrontendOutbox.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { getReplayBlock } from './getReplayBlock/getReplayBlock.js';
import { getReplayBlocks } from './getReplayBlocks/getReplayBlocks.js';
import { getReplayBound } from './getReplayBound/getReplayBound.js';
import { processSubscriber } from './processSubscriber/processSubscriber.js';
import { publish } from './publish/publish.js';
import { refreshQueue } from './refreshQueue/refreshQueue.js';
import { subscribeAggregateFrontend } from './subscribeAggregateFrontend/subscribeAggregateFrontend.js';

const DELIVERY_BATCH_SIZE = 100;

const aggregateBlockBoundDORepoConfig = makeBoundDORepoConfig({
  abbreviation: systemWorkerAbbreviations.aggregateBlockRepo,
  repoType: 'AggregateBlockRepo',
  namePattern: RoutePattern.parse('/:generationId/:aggregateId/:aggregateName'),
  managedRuntime,
  getDbConfig: Effect.fn('AggregateBlockRepo.getDbConfig')(function* ({
    storage,
  }) {
    const executedCommandColumns = [
      ...storage.sql.exec<{ name: string }>(
        'PRAGMA table_info(executedCommands)',
      ),
    ].map(column => column.name);
    const failedCommandColumns = [
      ...storage.sql.exec<{ name: string }>(
        'PRAGMA table_info(failedCommands)',
      ),
    ].map(column => column.name);
    const finalizedBlockColumns = [
      ...storage.sql.exec<{ name: string }>(
        'PRAGMA table_info(finalizedBlocks)',
      ),
    ].map(column => column.name);
    if (
      executedCommandColumns.includes('version') ||
      failedCommandColumns.includes('version') ||
      (finalizedBlockColumns.length > 0 &&
        !finalizedBlockColumns.includes('writeIndex')) ||
      (executedCommandColumns.length > 0 &&
        !executedCommandColumns.includes('replicaIndex')) ||
      (failedCommandColumns.length > 0 &&
        !failedCommandColumns.includes('replicaIndex'))
    ) {
      return yield* new ZerospinError({
        code: 'legacy-aggregate-block-command-persistence-reset-required',
        message:
          'AggregateBlockRepo contains legacy block or command persistence and must be reset before this code can run',
      });
    }
    return makeDbConfig({
      tables: aggregateBlockTables,
    });
  }),
});

export class AggregateBlockRepo extends makeBoundDORepo({
  boundDORepoConfig: aggregateBlockBoundDORepoConfig,
}) {
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly boundDORepoConfig = aggregateBlockBoundDORepoConfig;

  private readonly deliveryQueue = makeDeliveryQueue({
    storage: this.ctx.storage,
  });

  async publish(
    request: IRpcRequest<[IAggregateBlock]>,
  ): Promise<IRpcEnvelope<void, IAnyErrorJson>> {
    const db = this.db;
    const storage = this.ctx.storage;
    const envelope = await managedRuntime.runPromise(
      makeRpcHandler('AggregateBlockRepo.publish.rpc')(function* (
        block: IAggregateBlock,
      ) {
        return yield* publish({
          block,
          db,
          storage,
        }).pipe(
          Effect.mapError(error =>
            Schema.encodeSync(ZerospinError.schema)(Cause.originalError(error)),
          ),
        );
      })(request),
    );
    this.ctx.waitUntil(
      this.drainAggregateFrontendOutbox().then(
        () => undefined,
        () => undefined,
      ),
    );
    return envelope;
  }

  async subscribeAggregateFrontend(props: {
    userId: string;
    frontendName: string;
    currentAggregateCursor: IAggregateCursor | null;
    currentAggregateIndex: number | null;
    aggregateFrontendRepoName: string;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    const encoded = await managedRuntime.runPromise(
      subscribeAggregateFrontend({
        ...props,
        aggregateId: this.key.aggregateId,
        aggregateName: this.key.aggregateName,
        db: this.db,
        generationId: this.key.generationId,
      }).pipe(encodeRpc),
    );
    this.ctx.waitUntil(
      this.drainAggregateFrontendOutbox().then(
        () => undefined,
        () => undefined,
      ),
    );
    return encoded;
  }

  async getReplayBound(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        lastAggregateCursor: IAggregateCursor | null;
        aggregateIndex: number | null;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getReplayBound({ db: this.db }).pipe(encodeRpc),
    );
  }

  async getReplayBlock(props: {
    afterAggregateIndex: number | null;
    throughAggregateIndex: number;
  }): Promise<Schema.EitherEncoded<IAggregateBlock | null, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      getReplayBlock({ ...props, db: this.db }).pipe(encodeRpc),
    );
  }

  async getReplayBlocks(props: {
    afterAggregateCursor: IAggregateCursor | null;
    afterAggregateIndex: number | null;
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        blocks: readonly IAggregateBlock[];
        lastAvailableAggregateCursor: IAggregateCursor | null;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getReplayBlocks({
        ...props,
        batchSize: DELIVERY_BATCH_SIZE,
        db: this.db,
      }).pipe(encodeRpc),
    );
  }

  async drainAggregateFrontendOutbox(): Promise<
    Schema.EitherEncoded<void, IAnyErrorJson>
  > {
    const db = this.db;
    const generationId = this.key.generationId;
    const collector = makeTelemetryCollector();
    const encoded = await managedRuntime.runPromise(
      drainAggregateFrontendOutbox({
        deliveryQueue: this.deliveryQueue,
        storage: this.ctx.storage,
        refresh: () =>
          refreshQueue({
            db,
            deliveryBatchSize: DELIVERY_BATCH_SIZE,
          }),
        processSubscriber: (subscriberDelivery, retry) =>
          processSubscriber({
            db,
            generationId,
            retry,
            subscriberDelivery,
          }).pipe(
            Effect.provide(AsyncLive),
            Effect.provideService(TelemetryCollector, collector),
          ),
      }).pipe(Effect.provide(makeTelemetryLayer(collector)), encodeRpc),
    );

    const batch = collector.flush();
    await managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemLogRepo = yield* getSystemLogRepo({
          key: { generationId },
        });
        const encoded = yield* makeAsync(() =>
          systemLogRepo.appendTelemetryBatch({
            batch,
          }),
        );
        yield* decodeRpc(encoded);
      }).pipe(
        Effect.catchAll(() => Effect.void),
        Effect.provide(AsyncLive),
      ),
    );

    return encoded;
  }

  async drainGeneration(): Promise<
    Schema.EitherEncoded<
      Readonly<{ pendingFrontendSubscriberCount: number }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      drainGeneration({
        db: this.db,
        drainAggregateFrontendOutbox: makeAsync(() =>
          this.drainAggregateFrontendOutbox(),
        ).pipe(Effect.flatMap(decodeRpc)),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    const db = this.db;
    const generationId = this.key.generationId;
    const collector = makeTelemetryCollector();
    await managedRuntime.runPromise(
      alarm({
        deliveryQueue: this.deliveryQueue,
        storage: this.ctx.storage,
        refresh: () =>
          refreshQueue({ db, deliveryBatchSize: DELIVERY_BATCH_SIZE }),
        processSubscriber: (subscriberDelivery, retry) =>
          processSubscriber({
            db,
            generationId,
            retry,
            subscriberDelivery,
          }).pipe(
            Effect.provide(AsyncLive),
            Effect.provideService(TelemetryCollector, collector),
          ),
      }).pipe(Effect.provide(makeTelemetryLayer(collector))),
    );

    const batch = collector.flush();
    await managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemLogRepo = yield* getSystemLogRepo({
          key: { generationId },
        });
        const encoded = yield* makeAsync(() =>
          systemLogRepo.appendTelemetryBatch({
            batch,
          }),
        );
        yield* decodeRpc(encoded);
      }).pipe(
        Effect.catchAll(() => Effect.void),
        Effect.provide(AsyncLive),
      ),
    );
  }
}
