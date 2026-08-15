import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { isNotNull, isNull, or } from 'drizzle-orm';
import { Effect } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { aggregateRepoDrizzleSchemas } from '../AggregateRepo.js';
import { drainAggregateOutboxes } from '../drainAggregateOutboxes/drainAggregateOutboxes.js';

/** Finishes aggregate outboxes and verifies that no obligation remains. */
export const drainGeneration = Effect.fn('AggregateRepo.drainGeneration')(
  function* (props: {
    aggregateId: string;
    aggregateName: string;
    aggregateRepoName: string;
    db: IDb;
    deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
    generationId: string;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    Readonly<{
      pendingServiceSubscriptionCount: number;
      pendingAggregateBlockCount: number;
    }>,
    IAnyError,
    Async
  > {
    const {
      aggregateId,
      aggregateName,
      aggregateRepoName,
      db,
      deliveryQueue,
      generationId,
      storage,
    } = props;

    // 1 — the compatible Worker finishes predecessor aggregate obligations.
    yield* drainAggregateOutboxes({
      aggregateRepoName,
      generationId,
      aggregateId,
      aggregateName,
      db,
      deliveryQueue,
      storage,
    });

    // 2 — verify every durable aggregate obligation is terminal.
    const pendingServiceSubscriptionCount = db
      .select({
        serviceRepoName:
          aggregateRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName,
      })
      .from(aggregateRepoDrizzleSchemas.serviceSubscriptions)
      .where(
        or(
          isNull(aggregateRepoDrizzleSchemas.serviceSubscriptions.subscribedAt),
          isNotNull(aggregateRepoDrizzleSchemas.serviceSubscriptions.failure),
        ),
      )
      .all().length;
    const pendingAggregateBlockCount = db
      .select({
        aggregateIndex:
          aggregateRepoDrizzleSchemas.aggregateBlockOutbox.aggregateIndex,
      })
      .from(aggregateRepoDrizzleSchemas.aggregateBlockOutbox)
      .where(
        or(
          isNull(aggregateRepoDrizzleSchemas.aggregateBlockOutbox.publishedAt),
          isNotNull(aggregateRepoDrizzleSchemas.aggregateBlockOutbox.failure),
        ),
      )
      .all().length;

    // 3 — source replay is unsafe while either durable aggregate obligation remains.
    if (pendingServiceSubscriptionCount > 0 || pendingAggregateBlockCount > 0) {
      return yield* new ZerospinError({
        code: 'aggregate-generation-drain-incomplete',
        message: 'AggregateRepo still has pending work after generation drain',
        extra: {
          pendingServiceSubscriptionCount,
          pendingAggregateBlockCount,
        },
      });
    }

    return { pendingServiceSubscriptionCount, pendingAggregateBlockCount };
  },
);
