/*
 * System-worker annotation:
 * Implements the SystemRepo upsert Account operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { Effect } from 'effect';

export const upsertAccount = Effect.fn('SystemRepo.upsertAccount')(
  function* (props: { db: IDb; accountTable: unknown; accountId: string }) {
    const { db, accountTable, accountId } = props;
    yield* Effect.void;
    db.insert(accountTable as never)
      .values({ accountId } as never)
      .onConflictDoNothing()
      .run();
  },
);
