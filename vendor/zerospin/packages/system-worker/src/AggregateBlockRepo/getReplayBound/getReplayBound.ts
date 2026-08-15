import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAggregateCursor } from '@zerospin/core/models/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { desc } from 'drizzle-orm';
import { Effect } from 'effect';

import { aggregateBlockDrizzleSchemas } from '../aggregateBlockDrizzleSchemas.js';

/** Reads the immutable terminal aggregate-ledger watermark captured after drain. */
export const getReplayBound = Effect.fn('AggregateBlockRepo.getReplayBound')(
  function* (props: { db: IDb }): Effect.fn.Return<
    Readonly<{
      lastAggregateCursor: IAggregateCursor | null;
      aggregateIndex: number | null;
    }>,
    IAnyError
  > {
    const { db } = props;

    // 1 — the greatest persisted block index is the replay terminal bound.
    const row = db
      .select({
        lastAggregateCursor:
          aggregateBlockDrizzleSchemas.finalizedBlocks.lastAggregateCursor,
        aggregateIndex:
          aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex,
      })
      .from(aggregateBlockDrizzleSchemas.finalizedBlocks)
      .orderBy(
        desc(aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex),
      )
      .limit(1)
      .get();

    // 2 — an empty ledger is represented only by the paired null watermark.
    const lastAggregateCursor = row?.lastAggregateCursor ?? null;
    const aggregateIndex = row?.aggregateIndex ?? null;
    if ((lastAggregateCursor === null) !== (aggregateIndex === null)) {
      return yield* new ZerospinError({
        code: 'aggregate-replay-bound-watermark-incomplete',
        message:
          'AggregateBlockRepo replay bound requires cursor and index to both be null or both be present',
      });
    }
    if (aggregateIndex !== null && !Number.isInteger(aggregateIndex)) {
      return yield* new ZerospinError({
        code: 'aggregate-replay-bound-index-invalid',
        message: `AggregateBlockRepo replay bound index must be an integer, received ${aggregateIndex}`,
      });
    }

    // 3 — callers perform no block reads when both values are null.
    return { lastAggregateCursor, aggregateIndex };
  },
);
