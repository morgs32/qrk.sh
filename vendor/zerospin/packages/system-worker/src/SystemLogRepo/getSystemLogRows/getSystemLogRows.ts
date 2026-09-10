/*
 * System-worker annotation:
 * Reads the newest SystemLogRepo rows for dashboard tables and live-tail bootstrap.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { ISystemLogRow } from '@zerospin/core/system/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { desc } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import {
  systemLogRepoDbConfig,
  systemLogRowSchema,
} from '../systemLogRepoDbConfig.js';

/*
 * Log dashboard and live-tail bootstrap read newest retained log rows here.
 * The reader caps the requested window and validates each persisted row.
 *
 * 1. Bound the log window.
 * 2. Read and decode the newest log rows.
 */
export const getSystemLogRows = Effect.fn('SystemLogRepo.getSystemLogRows')(
  function* (props: {
    db: IDb;
    limit: number;
  }): Effect.fn.Return<readonly ISystemLogRow[], IAnyError> {
    const { db, limit } = props;

    // 1 — clamp limit between 1 and 1000
    const boundedLimit = Math.max(1, Math.min(limit, 1000));

    // 2 — order by descending logIndex and map failures to log-rows-read-failed
    return yield* Effect.try({
      try: () =>
        db
          .select()
          .from(systemLogRepoDbConfig.schema.logs)
          .orderBy(desc(systemLogRepoDbConfig.schema.logs.logIndex))
          .limit(boundedLimit)
          .all()
          .map(row => Schema.decodeUnknownSync(systemLogRowSchema)(row)),
      catch: ZerospinError.catch({ code: 'log-rows-read-failed' }),
    });
  },
);
