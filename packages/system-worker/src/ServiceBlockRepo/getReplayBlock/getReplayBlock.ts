import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, asc, gt, lte } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { ServiceBlockSchema } from '../../blockSchemas.js';
import type { IServiceBlock } from '../../types.js';
import { serviceBlockDrizzleSchemas } from '../ServiceBlockRepo.js';

/** Reads exactly the next service block inside a previously captured bound. */
export const getReplayBlock = Effect.fn('ServiceBlockRepo.getReplayBlock')(
  function* (props: {
    afterServiceIndex: number | null;
    throughServiceIndex: number;
    db: IDb;
  }): Effect.fn.Return<IServiceBlock | null, IAnyError> {
    const { afterServiceIndex, throughServiceIndex, db } = props;

    // 1 — reject malformed bounds before they can select an ambiguous block.
    if (!Number.isInteger(throughServiceIndex)) {
      return yield* new ZerospinError({
        code: 'service-replay-through-index-invalid',
        message: `Service replay throughServiceIndex must be an integer, received ${throughServiceIndex}`,
      });
    }
    if (
      afterServiceIndex !== null &&
      !Number.isInteger(afterServiceIndex)
    ) {
      return yield* new ZerospinError({
        code: 'service-replay-after-index-invalid',
        message: `Service replay afterServiceIndex must be null or an integer, received ${afterServiceIndex}`,
      });
    }

    // 2 — select only the lowest block in the half-open/closed range (after, through].
    const row =
      afterServiceIndex === null
        ? db
            .select()
            .from(serviceBlockDrizzleSchemas.serviceBlocks)
            .where(
              lte(
                serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
                throughServiceIndex,
              ),
            )
            .orderBy(
              asc(serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex),
            )
            .limit(1)
            .get()
        : db
            .select()
            .from(serviceBlockDrizzleSchemas.serviceBlocks)
            .where(
              and(
                gt(
                  serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
                  afterServiceIndex,
                ),
                lte(
                  serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
                  throughServiceIndex,
                ),
              ),
            )
            .orderBy(
              asc(serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex),
            )
            .limit(1)
            .get();
    if (row === undefined) {
      return null;
    }

    // 3 — decode the exact stored block and verify its duplicated row watermark.
    const block = yield* Schema.decodeUnknown(
      Schema.parseJson(ServiceBlockSchema),
    )(row.block).pipe(
      mapParseError({
        code: 'service-replay-block-decode-failed',
        prefix: `Failed to decode ServiceBlockRepo replay block at index ${row.serviceIndex}`,
      }),
    );
    if (
      block.serviceIndex !== row.serviceIndex ||
      block.lastServiceCursor !== row.lastServiceCursor
    ) {
      return yield* new ZerospinError({
        code: 'service-replay-block-watermark-mismatch',
        message: `ServiceBlockRepo row ${row.serviceIndex} does not match its encoded block watermark`,
      });
    }

    return block;
  },
);
