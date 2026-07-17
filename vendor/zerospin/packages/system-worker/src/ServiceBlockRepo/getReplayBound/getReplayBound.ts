import type { IDb } from '@zerospin/core/drizzle/types';
import type { IServiceCursorId } from '@zerospin/core/models/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { desc } from 'drizzle-orm';
import { Effect } from 'effect';

import { serviceBlockDrizzleSchemas } from '../ServiceBlockRepo.js';

/** Reads the immutable terminal service-ledger watermark captured after drain. */
export const getReplayBound = Effect.fn('ServiceBlockRepo.getReplayBound')(
  function* (props: {
    db: IDb;
  }): Effect.fn.Return<
    Readonly<{
      lastServiceCursor: IServiceCursorId | null;
      serviceIndex: number | null;
    }>,
    IAnyError
  > {
    const { db } = props;

    // 1 — the greatest persisted block index is the replay terminal bound.
    const row = db
      .select({
        lastServiceCursor:
          serviceBlockDrizzleSchemas.serviceBlocks.lastServiceCursor,
        serviceIndex: serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
      })
      .from(serviceBlockDrizzleSchemas.serviceBlocks)
      .orderBy(desc(serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex))
      .limit(1)
      .get();

    // 2 — an empty ledger is represented only by the paired null watermark.
    const lastServiceCursor = row?.lastServiceCursor ?? null;
    const serviceIndex = row?.serviceIndex ?? null;
    if ((lastServiceCursor === null) !== (serviceIndex === null)) {
      return yield* new ZerospinError({
        code: 'service-replay-bound-watermark-incomplete',
        message:
          'ServiceBlockRepo replay bound requires cursor and index to both be null or both be present',
      });
    }
    if (serviceIndex !== null && !Number.isInteger(serviceIndex)) {
      return yield* new ZerospinError({
        code: 'service-replay-bound-index-invalid',
        message: `ServiceBlockRepo replay bound index must be an integer, received ${serviceIndex}`,
      });
    }

    // 3 — callers perform no block reads when both values are null.
    return { lastServiceCursor, serviceIndex };
  },
);
