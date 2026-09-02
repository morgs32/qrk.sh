/*
 * System-worker annotation:
 * Implements the SystemRepo get Aggregate Ids operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError } from '@zerospin/error';
import {
  makeAbbreviationIdSchema,
  type IAnyDrizzleSchema,
} from '@zerospin/schema';
import type { AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

export const getAggregateIds = Effect.fn('SystemRepo.getAggregateIds')(
  function* (props: {
    db: IDb;
    aggregateTable: IAnyDrizzleSchema & {
      aggregateId: AnyColumn;
    };
  }) {
    const { aggregateTable, db } = props;
    yield* Effect.void;
    const rows = db
      .select({ aggregateId: aggregateTable.aggregateId })
      .from(aggregateTable)
      .all();
    return yield* Schema.decodeUnknownEffect(
      Schema.Array(makeAbbreviationIdSchema(coreAbbreviations.aggregate)),
    )(rows.map(row => row.aggregateId)).pipe(
      mapParseError({
        code: 'system-aggregate-registry-row-invalid',
        prefix: 'Stored aggregate registry row is invalid',
      }),
    );
  },
);
