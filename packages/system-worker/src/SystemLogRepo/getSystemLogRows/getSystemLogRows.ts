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
  systemLogRepoDrizzleSchemas,
  systemLogRowSchema,
} from '../SystemLogRepo.js';

export const getSystemLogRows = Effect.fn('SystemLogRepo.getSystemLogRows')(
  function* (props: {
    db: IDb;
    limit: number;
  }): Effect.fn.Return<readonly ISystemLogRow[], IAnyError> {
    const { db } = props;
    const limit = Math.max(1, Math.min(props.limit, 1000));
    return yield* Effect.try({
      try: () =>
        db
          .select()
          .from(systemLogRepoDrizzleSchemas.logs)
          .orderBy(desc(systemLogRepoDrizzleSchemas.logs.logIndex))
          .limit(limit)
          .all()
          .map(row => Schema.decodeUnknownSync(systemLogRowSchema)(row)),
      catch: ZerospinError.catch({ code: 'log-rows-read-failed' }),
    });
  },
);
