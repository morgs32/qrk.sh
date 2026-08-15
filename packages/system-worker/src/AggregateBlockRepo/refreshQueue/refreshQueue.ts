/*
 * System-worker annotation:
 * Rebuilds AggregateBlockRepo subscriber delivery work from durable block state.
 */

import {
  EncodedExecutedAggregateCommandSchema,
  EncodedFailedAggregateCommandSchema,
  ExecutedPushedCommandSchema,
  FinalizedFailedStagedReplicaCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { asc, desc, gt, isNull, lt, or } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { IAggregateBlock } from '../../types.js';
import { aggregateBlockDrizzleSchemas } from '../aggregateBlockDrizzleSchemas.js';

export const refreshQueue = Effect.fn('AggregateBlockRepo.refreshQueue')(
  function* (props: { db: IDb; deliveryBatchSize: number }) {
    const { db, deliveryBatchSize } = props;
    const latestBlock = db
      .select({
        aggregateIndex:
          aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex,
      })
      .from(aggregateBlockDrizzleSchemas.finalizedBlocks)
      .orderBy(
        desc(aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex),
      )
      .get();
    if (latestBlock === undefined) {
      return [];
    }

    const laggingSubscriber = or(
      isNull(
        aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
          .currentAggregateIndex,
      ),
      lt(
        aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
          .currentAggregateIndex,
        latestBlock.aggregateIndex,
      ),
    );
    const subscribers = db
      .select()
      .from(aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers)
      .where(laggingSubscriber)
      .orderBy(
        asc(
          aggregateBlockDrizzleSchemas.aggregateFrontendSubscribers
            .currentAggregateIndex,
        ),
      )
      .all();
    const firstSubscriber = subscribers[0];
    if (firstSubscriber === undefined) {
      return [];
    }

    const rows =
      firstSubscriber.currentAggregateIndex === null
        ? db
            .select()
            .from(aggregateBlockDrizzleSchemas.finalizedBlocks)
            .orderBy(
              asc(aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex),
            )
            .limit(deliveryBatchSize)
            .all()
        : db
            .select()
            .from(aggregateBlockDrizzleSchemas.finalizedBlocks)
            .where(
              gt(
                aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex,
                firstSubscriber.currentAggregateIndex,
              ),
            )
            .orderBy(
              asc(aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex),
            )
            .limit(deliveryBatchSize)
            .all();
    if (rows.length === 0) {
      return yield* new ZerospinError({
        code: 'aggregate-block-cursor-gap',
        message:
          'AggregateBlockRepo lagging subscriber index has no newer block',
      });
    }

    const blocks: IAggregateBlock[] = [];
    for (const row of rows) {
      const executedCommands = yield* Schema.decodeUnknown(
        Schema.parseJson(
          Schema.Array(
            Schema.Union(
              EncodedExecutedAggregateCommandSchema,
              ExecutedPushedCommandSchema,
            ),
          ),
        ),
      )(row.executedCommands).pipe(
        mapParseError({
          code: 'aggregate-block-executed-commands-decode-failed',
          prefix: 'Failed to decode finalized block executed commands',
        }),
      );
      const failedCommands = yield* Schema.decodeUnknown(
        Schema.parseJson(
          Schema.Array(
            Schema.Union(
              EncodedFailedAggregateCommandSchema,
              FinalizedFailedStagedReplicaCommandSchema,
              FailedPushedCommandSchema,
            ),
          ),
        ),
      )(row.failedCommands).pipe(
        mapParseError({
          code: 'aggregate-block-failed-commands-decode-failed',
          prefix: 'Failed to decode finalized block failed commands',
        }),
      );
      const appliedMutations = yield* Schema.decodeUnknown(
        Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
      )(row.appliedMutations).pipe(
        mapParseError({
          code: 'aggregate-block-applied-mutations-decode-failed',
          prefix: 'Failed to decode finalized block applied mutations',
        }),
      );
      blocks.push({
        writeIndex: row.writeIndex,
        lastAggregateCursor: row.lastAggregateCursor,
        aggregateIndex: row.aggregateIndex,
        executedCommands,
        failedCommands,
        appliedMutations,
      });
    }

    const subscriberDeliveries: {
      subscriber: (typeof subscribers)[number];
      blocks: readonly IAggregateBlock[];
    }[] = [];
    const sharedBlocks = [...blocks];
    for (const subscriber of subscribers) {
      while (
        sharedBlocks[0] !== undefined &&
        subscriber.currentAggregateIndex !== null &&
        sharedBlocks[0].aggregateIndex <= subscriber.currentAggregateIndex
      ) {
        sharedBlocks.shift();
      }

      if (sharedBlocks.length === 0) {
        break;
      }

      subscriberDeliveries.push({
        subscriber,
        blocks: sharedBlocks.slice(),
      });
    }

    return subscriberDeliveries;
  },
);
