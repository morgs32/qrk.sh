/*
 * System-worker annotation:
 * Claims and delivers one AggregateBlockRepo subscriber queue item.
 */

import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  makeTraceableRpcTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import { and, eq, isNull } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { aggregateBlockDrizzleSchemas } from '../aggregateBlockDrizzleSchemas.js';
import type { refreshQueue } from '../refreshQueue/refreshQueue.js';

export const processSubscriber = Effect.fn(
  'AggregateBlockRepo.processSubscriber',
)(function* (props: {
  db: IDb;
  generationId: string;
  retry: ReturnType<typeof makeDeliveryQueue>['retry'];
  subscriberDelivery: Effect.Effect.Success<
    ReturnType<typeof refreshQueue>
  >[number];
}): Effect.fn.Return<boolean, IAnyError, Async | TelemetryCollector> {
  const { db, retry, subscriberDelivery } = props;
  const lastBlock =
    subscriberDelivery.blocks[subscriberDelivery.blocks.length - 1];
  if (lastBlock === undefined) {
    return true;
  }

  const subscriber = subscriberDelivery.subscriber;
  const currentAggregateCursorMatch =
    subscriber.currentAggregateCursor === null
      ? isNull(
          aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
            .currentAggregateCursor,
        )
      : eq(
          aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
            .currentAggregateCursor,
          subscriber.currentAggregateCursor,
        );
  const currentAggregateIndexMatch =
    subscriber.currentAggregateIndex === null
      ? isNull(
          aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
            .currentAggregateIndex,
        )
      : eq(
          aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
            .currentAggregateIndex,
          subscriber.currentAggregateIndex,
        );
  const queuedAggregateCursorMatch =
    subscriber.queuedAggregateCursor === null
      ? isNull(
          aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
            .queuedAggregateCursor,
        )
      : eq(
          aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
            .queuedAggregateCursor,
          subscriber.queuedAggregateCursor,
        );
  const queuedAggregateIndexMatch =
    subscriber.queuedAggregateIndex === null
      ? isNull(
          aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
            .queuedAggregateIndex,
        )
      : eq(
          aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
            .queuedAggregateIndex,
          subscriber.queuedAggregateIndex,
        );
  const lastDeliveryErrorMatch =
    subscriber.lastDeliveryError === null
      ? isNull(
          aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
            .lastDeliveryError,
        )
      : eq(
          aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
            .lastDeliveryError,
          subscriber.lastDeliveryError,
        );
  const subscriberSnapshotMatch = and(
    eq(
      aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
        .aggregateFrontendRepoName,
      subscriber.aggregateFrontendRepoName,
    ),
    eq(
      aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers.aggregateId,
      subscriber.aggregateId,
    ),
    eq(
      aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers.aggregateName,
      subscriber.aggregateName,
    ),
    eq(
      aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers.userId,
      subscriber.userId,
    ),
    eq(
      aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers.frontendName,
      subscriber.frontendName,
    ),
    currentAggregateCursorMatch,
    currentAggregateIndexMatch,
    queuedAggregateCursorMatch,
    queuedAggregateIndexMatch,
    lastDeliveryErrorMatch,
  );

  let claimedQueuedAggregateCursor = subscriber.queuedAggregateCursor;
  let claimedQueuedAggregateIndex = subscriber.queuedAggregateIndex;
  if (
    claimedQueuedAggregateIndex === null ||
    claimedQueuedAggregateIndex < lastBlock.aggregateIndex ||
    claimedQueuedAggregateCursor !== lastBlock.lastAggregateCursor
  ) {
    claimedQueuedAggregateCursor = lastBlock.lastAggregateCursor;
    claimedQueuedAggregateIndex = lastBlock.aggregateIndex;
    db.update(aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers)
      .set({
        queuedAggregateCursor: claimedQueuedAggregateCursor,
        queuedAggregateIndex: claimedQueuedAggregateIndex,
      })
      .where(subscriberSnapshotMatch)
      .run();
  }

  const claimedQueuedAggregateCursorMatch =
    claimedQueuedAggregateCursor === null
      ? isNull(
          aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
            .queuedAggregateCursor,
        )
      : eq(
          aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
            .queuedAggregateCursor,
          claimedQueuedAggregateCursor,
        );
  const claimedQueuedAggregateIndexMatch =
    claimedQueuedAggregateIndex === null
      ? isNull(
          aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
            .queuedAggregateIndex,
        )
      : eq(
          aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
            .queuedAggregateIndex,
          claimedQueuedAggregateIndex,
        );
  const claimedSubscriberMatch = and(
    eq(
      aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
        .aggregateFrontendRepoName,
      subscriber.aggregateFrontendRepoName,
    ),
    eq(
      aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers.aggregateId,
      subscriber.aggregateId,
    ),
    eq(
      aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers.aggregateName,
      subscriber.aggregateName,
    ),
    eq(
      aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers.userId,
      subscriber.userId,
    ),
    eq(
      aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers.frontendName,
      subscriber.frontendName,
    ),
    currentAggregateCursorMatch,
    currentAggregateIndexMatch,
    claimedQueuedAggregateCursorMatch,
    claimedQueuedAggregateIndexMatch,
    lastDeliveryErrorMatch,
  );
  const claimedSubscriber = db
    .select({
      aggregateFrontendRepoName:
        aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
          .aggregateFrontendRepoName,
    })
    .from(aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers)
    .where(claimedSubscriberMatch)
    .get();
  if (claimedSubscriber === undefined) {
    return true;
  }

  const aggregateFrontendRepo = env.AGGREGATE_FRONTEND_REPO.getByName(
    subscriber.aggregateFrontendRepoName,
  );
  const tracedAggregateFrontendRepo = makeTraceableRpcTarget(
    aggregateFrontendRepo,
  );

  const delivered = yield* retry(
    tracedAggregateFrontendRepo
      .handleAggregateBlocks({
        blocks: subscriberDelivery.blocks,
      })
      .pipe(
        Effect.mapError(errorJson =>
          errorJson instanceof Error
            ? new ZerospinError({
                code: 'aggregate-block-delivery-rpc-failed',
                message: errorJson.message,
                cause: ZerospinError.prettyUnknownFailure(errorJson),
              })
            : Schema.decodeUnknownSync(ZerospinError.schema)(errorJson),
        ),
        Effect.asVoid,
      ),
  ).pipe(Effect.either);

  if (Either.isLeft(delivered)) {
    db.update(aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers)
      .set({
        lastDeliveryError:
          delivered.left instanceof Error
            ? delivered.left.message
            : String(delivered.left),
      })
      .where(claimedSubscriberMatch)
      .run();
    return false;
  }

  db.update(aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers)
    .set({
      currentAggregateCursor: lastBlock.lastAggregateCursor,
      currentAggregateIndex: lastBlock.aggregateIndex,
      queuedAggregateCursor: lastBlock.lastAggregateCursor,
      queuedAggregateIndex: lastBlock.aggregateIndex,
      lastDeliveryError: null,
    })
    .where(claimedSubscriberMatch)
    .run();
  return true;
});
