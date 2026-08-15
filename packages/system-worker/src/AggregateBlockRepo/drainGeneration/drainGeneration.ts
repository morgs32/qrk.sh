import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { Effect } from 'effect';

import { aggregateBlockDrizzleSchemas } from '../aggregateBlockDrizzleSchemas.js';

/** Force-finishes finite frontend fanout and verifies that no delivery remains. */
export const drainGeneration = Effect.fn('AggregateBlockRepo.drainGeneration')(
  function* (props: {
    db: IDb;
    drainAggregateFrontendOutbox: Effect.Effect<void, IAnyError, Async>;
  }): Effect.fn.Return<
    Readonly<{ pendingFrontendSubscriberCount: number }>,
    IAnyError,
    Async
  > {
    const { db, drainAggregateFrontendOutbox } = props;

    // 1 — the compatible Worker finishes predecessor frontend delivery.
    yield* drainAggregateFrontendOutbox;

    // 2 — verify every subscriber reached the immutable terminal block.
    const terminalBlock = db
      .select({
        aggregateIndex:
          aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex,
      })
      .from(aggregateBlockDrizzleSchemas.finalizedBlocks)
      .orderBy(
        desc(aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex),
      )
      .limit(1)
      .get();
    const pendingFrontendSubscriberCount =
      terminalBlock === undefined
        ? db
            .select({
              aggregateFrontendRepoName:
                aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
                  .aggregateFrontendRepoName,
            })
            .from(aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers)
            .where(
              isNotNull(
                aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
                  .lastDeliveryError,
              ),
            )
            .all().length
        : db
            .select({
              aggregateFrontendRepoName:
                aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
                  .aggregateFrontendRepoName,
            })
            .from(aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers)
            .where(
              or(
                isNull(
                  aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
                    .currentAggregateIndex,
                ),
                lt(
                  aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
                    .currentAggregateIndex,
                  terminalBlock.aggregateIndex,
                ),
                isNotNull(
                  aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
                    .lastDeliveryError,
                ),
              ),
            )
            .all().length;

    // 3 — fail closed until frontend delivery has no durable work.
    if (pendingFrontendSubscriberCount > 0) {
      return yield* new ZerospinError({
        code: 'aggregate-block-generation-drain-incomplete',
        message:
          'AggregateBlockRepo still has pending subscriber work after generation drain',
        extra: { pendingFrontendSubscriberCount },
      });
    }

    return { pendingFrontendSubscriberCount };
  },
);
