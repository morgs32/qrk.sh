/*
 * System-worker annotation:
 * Implements the SystemRepo upsert Aggregate operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import type { AnyColumn } from 'drizzle-orm';
import { Effect } from 'effect';

export const upsertAggregate = Effect.fn('SystemRepo.upsertAggregate')(
  function* (props: {
    db: IDb;
    aggregateTable: IAnyDrizzleSchema & {
      aggregateId: AnyColumn;
      generationId: AnyColumn;
    };
    aggregateId: string;
    generationId: string;
  }) {
    const { aggregateId, aggregateTable, db, generationId } = props;
    yield* Effect.void;
    db.insert(aggregateTable)
      .values({ aggregateId, generationId })
      .onConflictDoNothing()
      .run();
  },
);
