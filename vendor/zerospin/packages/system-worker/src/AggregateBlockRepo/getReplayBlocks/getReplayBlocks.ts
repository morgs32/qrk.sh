import {
  EncodedExecutedAggregateCommandSchema,
  EncodedFailedAggregateCommandSchema,
  ExecutedPushedCommandSchema,
  FinalizedFailedStagedReplicaCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAggregateCursor } from '@zerospin/core/models/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { asc, gt, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { IAggregateBlock } from '../../types.js';
import { aggregateBlockDrizzleSchemas } from '../aggregateBlockDrizzleSchemas.js';

export const getReplayBlocks = Effect.fn('AggregateBlockRepo.getReplayBlocks')(
  function* (props: {
    afterAggregateCursor: IAggregateCursor | null;
    afterAggregateIndex: number | null;
    batchSize: number;
    db: IDb;
  }): Effect.fn.Return<
    Readonly<{
      blocks: readonly IAggregateBlock[];
      lastAvailableAggregateCursor: IAggregateCursor | null;
    }>,
    IAnyError
  > {
    const { afterAggregateCursor, afterAggregateIndex, batchSize, db } = props;

    if ((afterAggregateCursor === null) !== (afterAggregateIndex === null)) {
      return yield* new ZerospinError({
        code: 'aggregate-replay-after-watermark-incomplete',
        message:
          'Aggregate replay requires afterAggregateCursor and afterAggregateIndex to both be null or both be present',
      });
    }
    if (
      afterAggregateIndex !== null &&
      (!Number.isInteger(afterAggregateIndex) || afterAggregateIndex < 1)
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-replay-after-index-invalid',
        message: `Aggregate replay afterAggregateIndex must be null or a positive integer, received ${afterAggregateIndex}`,
      });
    }

    const replayBatch = db
      .select({
        writeIndex: aggregateBlockDrizzleSchemas.finalizedBlocks.writeIndex,
        lastAggregateCursor:
          aggregateBlockDrizzleSchemas.finalizedBlocks.lastAggregateCursor,
        aggregateIndex:
          aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex,
        executedCommands:
          aggregateBlockDrizzleSchemas.finalizedBlocks.executedCommands,
        failedCommands:
          aggregateBlockDrizzleSchemas.finalizedBlocks.failedCommands,
        appliedMutations:
          aggregateBlockDrizzleSchemas.finalizedBlocks.appliedMutations,
      })
      .from(aggregateBlockDrizzleSchemas.finalizedBlocks)
      .where(
        afterAggregateIndex === null
          ? undefined
          : gt(
              aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex,
              afterAggregateIndex,
            ),
      )
      .orderBy(asc(aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex))
      .limit(batchSize)
      .as('replayBatch');
    const rows = db
      .select({
        writeIndex: replayBatch.writeIndex,
        lastAggregateCursor: replayBatch.lastAggregateCursor,
        aggregateIndex: replayBatch.aggregateIndex,
        executedCommands: replayBatch.executedCommands,
        failedCommands: replayBatch.failedCommands,
        appliedMutations: replayBatch.appliedMutations,
        cursorAtAfterAggregateIndex:
          afterAggregateIndex === null
            ? sql<IAggregateCursor | null>`null`
            : sql<IAggregateCursor | null>`(
                select ${aggregateBlockDrizzleSchemas.finalizedBlocks.lastAggregateCursor}
                from ${aggregateBlockDrizzleSchemas.finalizedBlocks}
                where ${aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex} = ${afterAggregateIndex}
                limit 1
              )`,
        lastAvailableAggregateCursor: sql<IAggregateCursor | null>`(
          select ${aggregateBlockDrizzleSchemas.finalizedBlocks.lastAggregateCursor}
          from ${aggregateBlockDrizzleSchemas.finalizedBlocks}
          order by ${aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex} desc
          limit 1
        )`,
      })
      .from(sql`(select 1)`)
      .leftJoin(replayBatch, sql`true`)
      .orderBy(asc(replayBatch.aggregateIndex))
      .all();
    const envelope = rows[0];
    if (envelope === undefined) {
      return yield* new ZerospinError({
        code: 'aggregate-replay-envelope-missing',
        message: 'Aggregate replay did not return an archive envelope',
      });
    }
    if (envelope.cursorAtAfterAggregateIndex !== afterAggregateCursor) {
      return yield* new ZerospinError({
        code: 'aggregate-replay-after-watermark-mismatch',
        message:
          'Aggregate replay continuation cursor does not match the archived cursor at its aggregate index',
        extra: {
          afterAggregateIndex,
          expectedAfterAggregateCursor: envelope.cursorAtAfterAggregateIndex,
          actualAfterAggregateCursor: afterAggregateCursor,
        },
      });
    }

    const blocks: IAggregateBlock[] = [];
    for (const row of rows) {
      if (row.aggregateIndex === null) {
        continue;
      }
      if (
        row.lastAggregateCursor === null ||
        row.writeIndex === null ||
        row.executedCommands === null ||
        row.failedCommands === null ||
        row.appliedMutations === null
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-replay-block-incomplete',
          message: `Aggregate replay block at index ${row.aggregateIndex} is incomplete`,
        });
      }
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
          code: 'aggregate-replay-executed-commands-decode-failed',
          prefix: `Failed to decode AggregateBlockRepo replay block executed commands at index ${row.aggregateIndex}`,
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
          code: 'aggregate-replay-failed-commands-decode-failed',
          prefix: `Failed to decode AggregateBlockRepo replay block failed commands at index ${row.aggregateIndex}`,
        }),
      );
      const appliedMutations = yield* Schema.decodeUnknown(
        Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
      )(row.appliedMutations).pipe(
        mapParseError({
          code: 'aggregate-replay-applied-mutations-decode-failed',
          prefix: `Failed to decode AggregateBlockRepo replay block mutations at index ${row.aggregateIndex}`,
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

    return {
      blocks,
      lastAvailableAggregateCursor: envelope.lastAvailableAggregateCursor,
    };
  },
);
