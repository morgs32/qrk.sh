/*
 * System-worker annotation:
 * Implements the SystemRepo get Aggregate Ids operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError } from '@zerospin/error';
import { eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

export const getAggregateIds = Effect.fn('SystemRepo.getAggregateIds')(
  function* (props: {
    db: IDb;
    aggregateTable: IAnyDrizzleSchema & {
      aggregateId: AnyColumn;
      generationId: AnyColumn;
    };
    generationId: string;
  }) {
    const { aggregateTable, db, generationId } = props;
    yield* Effect.void;
    const rows = db
      .select({ aggregateId: aggregateTable.aggregateId })
      .from(aggregateTable)
      .where(eq(aggregateTable.generationId, generationId))
      .all();
    return yield* Schema.decodeUnknown(
      Schema.Array(makeAbbreviationIdSchema(coreAbbreviations.aggregate)),
    )(rows.map(row => row.aggregateId)).pipe(
      mapParseError({
        code: 'system-aggregate-registry-row-invalid',
        prefix: 'Stored aggregate registry row is invalid',
        extra: { generationId },
      }),
    );
  },
);
