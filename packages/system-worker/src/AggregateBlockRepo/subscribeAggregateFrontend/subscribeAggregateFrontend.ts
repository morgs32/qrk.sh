/*
 * System-worker annotation:
 * Registers a AggregateFrontendRepo as a durable aggregate-block subscriber.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IAggregateCursor } from '@zerospin/core/models/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { AggregateFrontendRepo } from '../../AggregateFrontendRepo/AggregateFrontendRepo.js';
import { systemWorkerAbbreviations } from '../../systemWorkerAbbreviations.js';
import { aggregateBlockDrizzleSchemas } from '../aggregateBlockDrizzleSchemas.js';

export const subscribeAggregateFrontend = Effect.fn(
  'AggregateBlockRepo.subscribeAggregateFrontend',
)(function* (props: {
  aggregateId: string;
  aggregateName: string;
  userId: string;
  frontendName: string;
  generationId: string;
  currentAggregateCursor: IAggregateCursor | null;
  currentAggregateIndex: number | null;
  db: IDb;
  aggregateFrontendRepoName: string;
}) {
  const {
    aggregateId,
    aggregateName,
    userId,
    frontendName,
    generationId,
    currentAggregateCursor,
    currentAggregateIndex,
    db,
    aggregateFrontendRepoName,
  } = props;
  const persistedFrontendRepoName = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(systemWorkerAbbreviations.aggregateFrontendRepo),
  )(aggregateFrontendRepoName).pipe(
    mapParseError({
      code: 'aggregate-block-aggregate-frontend-repo-name-decode-failed',
      prefix: 'Failed to decode AggregateBlockRepo aggregateFrontendRepoName',
    }),
  );
  const exactFrontendRepoName =
    yield* AggregateFrontendRepo.boundDORepoConfig.nameUtils.makeName({
      generationId,
      aggregateId,
      aggregateName,
      userId,
      frontendName,
    });
  if (persistedFrontendRepoName !== exactFrontendRepoName) {
    return yield* new ZerospinError({
      code: 'aggregate-block-aggregate-frontend-target-mismatch',
      message:
        'AggregateBlockRepo subscription does not name the exact AggregateFrontendRepo target',
      extra: {
        aggregateId,
        aggregateName,
        userId,
        frontendName,
        aggregateFrontendRepoName: persistedFrontendRepoName,
        generationId,
      },
    });
  }

  if ((currentAggregateCursor === null) !== (currentAggregateIndex === null)) {
    return yield* new ZerospinError({
      code: 'aggregate-block-aggregate-frontend-watermark-incomplete',
      message:
        'AggregateBlockRepo subscription requires current aggregate cursor and index to both be null or both be present',
    });
  }
  if (
    currentAggregateIndex !== null &&
    !Number.isInteger(currentAggregateIndex)
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-block-aggregate-frontend-index-invalid',
      message: `AggregateBlockRepo subscription current aggregate index must be null or an integer, received ${currentAggregateIndex}`,
    });
  }

  const existingSubscriber = db
    .select()
    .from(aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers)
    .where(
      eq(
        aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
          .aggregateFrontendRepoName,
        persistedFrontendRepoName,
      ),
    )
    .get();
  if (
    existingSubscriber !== undefined &&
    (existingSubscriber.currentAggregateCursor === null) !==
      (existingSubscriber.currentAggregateIndex === null)
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-block-aggregate-frontend-current-watermark-incomplete',
      message:
        'AggregateBlockRepo subscriber current aggregate cursor and index must both be null or both be present',
    });
  }
  if (
    existingSubscriber !== undefined &&
    (existingSubscriber.queuedAggregateCursor === null) !==
      (existingSubscriber.queuedAggregateIndex === null)
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-block-aggregate-frontend-queued-watermark-incomplete',
      message:
        'AggregateBlockRepo subscriber queued aggregate cursor and index must both be null or both be present',
    });
  }
  if (
    existingSubscriber !== undefined &&
    existingSubscriber.currentAggregateIndex === currentAggregateIndex &&
    existingSubscriber.currentAggregateCursor !== currentAggregateCursor
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-block-aggregate-frontend-current-cursor-conflict',
      message:
        'AggregateBlockRepo subscription cursor conflicts with the persisted current cursor at the same aggregate index',
      extra: {
        aggregateFrontendRepoName: persistedFrontendRepoName,
        aggregateIndex: currentAggregateIndex,
        persistedAggregateCursor: existingSubscriber.currentAggregateCursor,
        suppliedAggregateCursor: currentAggregateCursor,
      },
    });
  }
  if (
    existingSubscriber !== undefined &&
    existingSubscriber.queuedAggregateIndex === currentAggregateIndex &&
    existingSubscriber.queuedAggregateCursor !== currentAggregateCursor
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-block-aggregate-frontend-queued-cursor-conflict',
      message:
        'AggregateBlockRepo subscription cursor conflicts with the persisted queued cursor at the same aggregate index',
      extra: {
        aggregateFrontendRepoName: persistedFrontendRepoName,
        aggregateIndex: currentAggregateIndex,
        persistedAggregateCursor: existingSubscriber.queuedAggregateCursor,
        suppliedAggregateCursor: currentAggregateCursor,
      },
    });
  }

  const preserveCurrentWatermark =
    existingSubscriber !== undefined &&
    (currentAggregateIndex === null ||
      (existingSubscriber.currentAggregateIndex !== null &&
        existingSubscriber.currentAggregateIndex >= currentAggregateIndex));
  const preserveQueuedWatermark =
    existingSubscriber !== undefined &&
    (currentAggregateIndex === null ||
      (existingSubscriber.queuedAggregateIndex !== null &&
        existingSubscriber.queuedAggregateIndex >= currentAggregateIndex));
  db.insert(aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers)
    .values({
      aggregateFrontendRepoName: persistedFrontendRepoName,
      aggregateId,
      aggregateName,
      userId,
      frontendName,
      currentAggregateCursor,
      currentAggregateIndex,
      queuedAggregateCursor: currentAggregateCursor,
      queuedAggregateIndex: currentAggregateIndex,
      lastDeliveryError: null,
    })
    .onConflictDoUpdate({
      target:
        aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
          .aggregateFrontendRepoName,
      set: {
        aggregateId,
        aggregateName,
        userId,
        frontendName,
        currentAggregateCursor: preserveCurrentWatermark
          ? existingSubscriber.currentAggregateCursor
          : currentAggregateCursor,
        currentAggregateIndex: preserveCurrentWatermark
          ? existingSubscriber.currentAggregateIndex
          : currentAggregateIndex,
        queuedAggregateCursor: preserveQueuedWatermark
          ? existingSubscriber.queuedAggregateCursor
          : currentAggregateCursor,
        queuedAggregateIndex: preserveQueuedWatermark
          ? existingSubscriber.queuedAggregateIndex
          : currentAggregateIndex,
        lastDeliveryError: null,
      },
    })
    .run();
});
