/*
 * System-worker annotation:
 * Implements the SystemRepo upsert Aggregate operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import type { AnyColumn } from 'drizzle-orm';
import { Effect } from 'effect';

export const upsertAggregate = Effect.fn('SystemRepo.upsertAggregate')(
  function* (props: {
    db: IDb;
    aggregateTable: IAnyDrizzleSchema & {
      aggregateId: AnyColumn;
    };
    aggregateId: string;
  }) {
    const { aggregateId, aggregateTable, db } = props;
    yield* Effect.void;
    db.insert(aggregateTable)
      .values({ aggregateId })
      .onConflictDoNothing()
      .run();
  },
);
