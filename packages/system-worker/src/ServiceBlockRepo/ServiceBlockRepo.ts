/*
 * ServiceBlockRepo is the singleton durable service-block archive and the
 * delivery owner for every AggregateRepo that permanently replicates from one service.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import type {} from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type { IAnyTables, IServiceCursorId } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IAnyErrorJson } from '@zerospin/error';
import { desc } from 'drizzle-orm';
import { Effect, type Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import { ServiceBlockSchema } from '../blockSchemas.js';
import { makeBoundDORepo } from '../makeBoundDORepo/makeBoundDORepo.js';
import { makeBoundDORepoConfig } from '../makeBoundDORepo/makeBoundDORepoConfig.js';
import { makeDeliveryQueue } from '../makeDeliveryQueue/makeDeliveryQueue.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';
import type { IServiceBlock } from '../types.js';

import { alarm } from './alarm/alarm.js';
import { drainAggregateSubscribers } from './drainAggregateSubscribers/drainAggregateSubscribers.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { drainServiceFrontendSubscribers } from './drainServiceFrontendSubscribers/drainServiceFrontendSubscribers.js';
import { getReplayBlock } from './getReplayBlock/getReplayBlock.js';
import { getReplayBound } from './getReplayBound/getReplayBound.js';
import { publish } from './publish/publish.js';
import { subscribeAggregate } from './subscribeAggregate/subscribeAggregate.js';
import { subscribeServiceFrontend } from './subscribeServiceFrontend/subscribeServiceFrontend.js';

const serviceBlockTables = {
  serviceBlocks: makeTable({
    name: 'serviceBlocks',
    shape: {
      lastServiceCursor: primitives.primaryKey({
        abbreviation: coreAbbreviations.serviceCursor,
      }),
      serviceIndex: primitives.integer({ unique: true }),
      block: primitives.json({ schema: ServiceBlockSchema }),
    },
  }),
  aggregateSubscribers: makeTable({
    name: 'aggregateSubscribers',
    shape: {
      aggregateRepoName: primitives.primaryKey({
        abbreviation: systemWorkerAbbreviations.aggregateRepo,
      }),
      aggregateId: primitives.text(),
      aggregateName: primitives.text(),
      currentServiceCursor: primitives.cursor({
        abbreviation: coreAbbreviations.serviceCursor,
      }),
      currentServiceIndex: primitives.integer(),
      lastDeliveryError: primitives.text({ nullable: true }),
    },
  }),
  serviceFrontendSubscribers: makeTable({
    name: 'serviceFrontendSubscribers',
    shape: {
      serviceFrontendRepoName: primitives.primaryKey({
        abbreviation: systemWorkerAbbreviations.serviceFrontendRepo,
      }),
      serviceName: primitives.text(),
      userId: primitives.text(),
      frontendName: primitives.text(),
      currentServiceCursor: primitives.cursor({
        abbreviation: coreAbbreviations.serviceCursor,
        nullable: true,
      }),
      currentServiceIndex: primitives.integer({ nullable: true }),
      catchupThroughServiceCursor: primitives.cursor({
        abbreviation: coreAbbreviations.serviceCursor,
        nullable: true,
      }),
      catchupThroughServiceIndex: primitives.integer({ nullable: true }),
      status: primitives.enum({ values: ['catching-up', 'live'] }),
      lastDeliveryError: primitives.text({ nullable: true }),
    },
  }),
} satisfies IAnyTables;

const serviceBlockDbConfig = makeDbConfig({ tables: serviceBlockTables });

export const serviceBlockDrizzleSchemas = serviceBlockDbConfig.schema;

const serviceBlockBoundDORepoConfig = makeBoundDORepoConfig({
  abbreviation: systemWorkerAbbreviations.serviceBlockRepo,
  repoType: 'ServiceBlockRepo',
  namePattern: RoutePattern.parse('/:generationId/:serviceName'),
  managedRuntime,
  getDbConfig: Effect.fn('ServiceBlockRepo.getDbConfig')(function* () {
    yield* Effect.void;
    return serviceBlockDbConfig;
  }),
});

export class ServiceBlockRepo extends makeBoundDORepo({
  boundDORepoConfig: serviceBlockBoundDORepoConfig,
}) {
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly boundDORepoConfig = serviceBlockBoundDORepoConfig;

  private readonly deliveryQueue = makeDeliveryQueue({
    storage: this.ctx.storage,
    hasPending: () =>
      Effect.sync(() => {
        const terminal = this.db
          .select({
            serviceIndex: serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
          })
          .from(serviceBlockDrizzleSchemas.serviceBlocks)
          .orderBy(desc(serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex))
          .limit(1)
          .get();
        return (
          this.db
            .select()
            .from(serviceBlockDrizzleSchemas.aggregateSubscribers)
            .all()
            .some(
              subscriber =>
                terminal !== undefined &&
                subscriber.currentServiceIndex < terminal.serviceIndex,
            ) ||
          this.db
            .select()
            .from(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
            .all()
            .some(
              subscriber =>
                subscriber.status === 'catching-up' ||
                (terminal !== undefined &&
                  (subscriber.currentServiceIndex ?? 0) <
                    terminal.serviceIndex),
            )
        );
      }),
  });

  async publish(
    block: IServiceBlock,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    const encoded = await managedRuntime.runPromise(
      publish({ block, db: this.db }).pipe(encodeRpc),
    );
    this.ctx.waitUntil(
      Promise.all([
        this.drainAggregateSubscribers(),
        this.drainServiceFrontendSubscribers(),
      ]).then(
        () => undefined,
        () => undefined,
      ),
    );
    return encoded;
  }

  async subscribeAggregate(props: {
    aggregateRepoName: string;
    aggregateId: string;
    aggregateName: string;
    currentServiceCursor: IServiceCursorId;
    currentServiceIndex: number;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    const encoded = await managedRuntime.runPromise(
      subscribeAggregate({ ...props, db: this.db }).pipe(encodeRpc),
    );
    this.ctx.waitUntil(
      this.drainAggregateSubscribers().then(
        () => undefined,
        () => undefined,
      ),
    );
    return encoded;
  }

  async subscribeServiceFrontend(props: {
    serviceFrontendRepoName: string;
    serviceName: string;
    userId: string;
    frontendName: string;
    currentServiceCursor: IServiceCursorId | null;
    currentServiceIndex: number | null;
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        throughServiceCursor: IServiceCursorId | null;
        throughServiceIndex: number | null;
      }>,
      IAnyErrorJson
    >
  > {
    const encoded = await managedRuntime.runPromise(
      subscribeServiceFrontend({
        ...props,
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        key: this.key,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
    this.ctx.waitUntil(
      this.drainServiceFrontendSubscribers().then(
        () => undefined,
        () => undefined,
      ),
    );
    return encoded;
  }

  async drainAggregateSubscribers(): Promise<
    Schema.EitherEncoded<void, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      drainAggregateSubscribers({
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        serviceName: this.key.serviceName,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainServiceFrontendSubscribers(): Promise<
    Schema.EitherEncoded<void, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      drainServiceFrontendSubscribers({
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        key: this.key,
        onlyServiceFrontendRepoName: null,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainGeneration(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        pendingAggregateSubscriberCount: number;
        pendingServiceFrontendSubscriberCount: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      drainGeneration({
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        generationId: this.key.generationId,
        serviceName: this.key.serviceName,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getReplayBound(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        lastServiceCursor: IServiceCursorId | null;
        serviceIndex: number | null;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getReplayBound({ db: this.db }).pipe(encodeRpc),
    );
  }

  async getReplayBlock(props: {
    afterServiceIndex: number | null;
    throughServiceIndex: number;
  }): Promise<Schema.EitherEncoded<IServiceBlock | null, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      getReplayBlock({ ...props, db: this.db }).pipe(encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    await managedRuntime.runPromise(
      alarm({
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        key: this.key,
      }).pipe(Effect.provide(AsyncLive)),
    );
  }
}
