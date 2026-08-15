import {
  EncodedExecutedAggregateCommandSchema,
  EncodedFailedAggregateCommandSchema,
  ExecutedPushedCommandSchema,
  FinalizedFailedStagedReplicaCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, asc, gt, lte } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { IAggregateBlock } from '../../types.js';
import { aggregateBlockDrizzleSchemas } from '../aggregateBlockDrizzleSchemas.js';

/** Reads exactly the next aggregate block inside a previously captured bound. */
export const getReplayBlock = Effect.fn('AggregateBlockRepo.getReplayBlock')(
  function* (props: {
    afterAggregateIndex: number | null;
    throughAggregateIndex: number;
    db: IDb;
  }): Effect.fn.Return<IAggregateBlock | null, IAnyError> {
    const { afterAggregateIndex, throughAggregateIndex, db } = props;

    // 1 — reject malformed bounds before they can select an ambiguous block.
    if (!Number.isInteger(throughAggregateIndex)) {
      return yield* new ZerospinError({
        code: 'aggregate-replay-through-index-invalid',
        message: `Aggregate replay throughAggregateIndex must be an integer, received ${throughAggregateIndex}`,
      });
    }
    if (
      afterAggregateIndex !== null &&
      !Number.isInteger(afterAggregateIndex)
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-replay-after-index-invalid',
        message: `Aggregate replay afterAggregateIndex must be null or an integer, received ${afterAggregateIndex}`,
      });
    }

    // 2 — select only the lowest block in the half-open/closed range (after, through].
    const row =
      afterAggregateIndex === null
        ? db
            .select()
            .from(aggregateBlockDrizzleSchemas.finalizedBlocks)
            .where(
              lte(
                aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex,
                throughAggregateIndex,
              ),
            )
            .orderBy(
              asc(aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex),
            )
            .limit(1)
            .get()
        : db
            .select()
            .from(aggregateBlockDrizzleSchemas.finalizedBlocks)
            .where(
              and(
                gt(
                  aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex,
                  afterAggregateIndex,
                ),
                lte(
                  aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex,
                  throughAggregateIndex,
                ),
              ),
            )
            .orderBy(
              asc(aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex),
            )
            .limit(1)
            .get();
    if (row === undefined) {
      return null;
    }

    // 3 — decode each archived JSON column without rebuilding command fields.
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

    // 4 — return the exact full command block and duplicated row watermark.
    return {
      writeIndex: row.writeIndex,
      lastAggregateCursor: row.lastAggregateCursor,
      aggregateIndex: row.aggregateIndex,
      executedCommands,
      failedCommands,
      appliedMutations,
    };
  },
);
