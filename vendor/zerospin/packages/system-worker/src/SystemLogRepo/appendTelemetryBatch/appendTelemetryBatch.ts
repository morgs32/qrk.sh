/*
 * System-worker annotation:
 * Persists one completed telemetry batch atomically. Stable logger IDs make
 * retries idempotent, and retention removes all owned rows for old traces.
 */

import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, type IAnyError } from '@zerospin/error';
import type { ITelemetryBatch } from '@zerospin/logger';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { systemLogRepoDrizzleSchemas } from '../SystemLogRepoDbConfig.js';

const maxTraces = 1000;

export const appendTelemetryBatch = Effect.fn(
  'SystemLogRepo.appendTelemetryBatch',
)(function* (props: {
  batch: ITelemetryBatch;
  db: IDb;
  systemId: string;
}): Effect.fn.Return<void, IAnyError> {
  const { batch, db } = props;
  const systemId = yield* Schema.decodeUnknownEffect(
    Schema.toType(makeAbbreviationIdSchema(coreAbbreviations.system)),
  )(props.systemId).pipe(
    mapParseError({
      code: 'failed-to-decode-telemetry-batch-system-id',
      prefix: 'Failed to decode SystemLogRepo telemetry systemId',
      extra: { systemId: props.systemId },
    }),
  );
  yield* makeTx({
    db,
    program: Effect.fn('SystemLogRepo.appendTelemetryBatch.transaction')(
      function* ({ tx }) {
        yield* Effect.void;

        for (const span of batch.spans) {
          tx.insert(systemLogRepoDrizzleSchemas.telemetrySpans)
            .values({
              ...span,
              attributes:
                span.attributes === null
                  ? null
                  : Schema.encodeSync(
                      Schema.fromJsonString(
                        Schema.Record(Schema.String, Schema.Unknown),
                      ),
                    )(span.attributes),
              systemId,
            })
            .onConflictDoNothing()
            .run();
        }

        for (const log of batch.logs) {
          tx.insert(systemLogRepoDrizzleSchemas.telemetryLogs)
            .values({
              ...log,
              payload:
                log.payload === null
                  ? null
                  : Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(
                      log.payload,
                    ),
              systemId,
            })
            .onConflictDoNothing()
            .run();
        }

        for (const link of batch.links) {
          tx.insert(systemLogRepoDrizzleSchemas.telemetryLinks)
            .values({
              ...link,
              systemId,
            })
            .onConflictDoNothing()
            .run();
        }

        tx.run(sql`
            DELETE FROM ${systemLogRepoDrizzleSchemas.telemetryLinks}
            WHERE ${systemLogRepoDrizzleSchemas.telemetryLinks.traceId} IN (
              SELECT ${systemLogRepoDrizzleSchemas.telemetrySpans.traceId}
              FROM ${systemLogRepoDrizzleSchemas.telemetrySpans}
              GROUP BY ${systemLogRepoDrizzleSchemas.telemetrySpans.traceId}
              ORDER BY MAX(${systemLogRepoDrizzleSchemas.telemetrySpans.endedAt}) DESC,
                ${systemLogRepoDrizzleSchemas.telemetrySpans.traceId} DESC
              LIMIT -1 OFFSET ${maxTraces}
            )
          `);
        tx.run(sql`
            DELETE FROM ${systemLogRepoDrizzleSchemas.telemetryLogs}
            WHERE ${systemLogRepoDrizzleSchemas.telemetryLogs.traceId} IN (
              SELECT ${systemLogRepoDrizzleSchemas.telemetrySpans.traceId}
              FROM ${systemLogRepoDrizzleSchemas.telemetrySpans}
              GROUP BY ${systemLogRepoDrizzleSchemas.telemetrySpans.traceId}
              ORDER BY MAX(${systemLogRepoDrizzleSchemas.telemetrySpans.endedAt}) DESC,
                ${systemLogRepoDrizzleSchemas.telemetrySpans.traceId} DESC
              LIMIT -1 OFFSET ${maxTraces}
            )
          `);
        tx.run(sql`
            DELETE FROM ${systemLogRepoDrizzleSchemas.telemetrySpans}
            WHERE ${systemLogRepoDrizzleSchemas.telemetrySpans.traceId} IN (
              SELECT ${systemLogRepoDrizzleSchemas.telemetrySpans.traceId}
              FROM ${systemLogRepoDrizzleSchemas.telemetrySpans}
              GROUP BY ${systemLogRepoDrizzleSchemas.telemetrySpans.traceId}
              ORDER BY MAX(${systemLogRepoDrizzleSchemas.telemetrySpans.endedAt}) DESC,
                ${systemLogRepoDrizzleSchemas.telemetrySpans.traceId} DESC
              LIMIT -1 OFFSET ${maxTraces}
            )
          `);
      },
    ),
  });
});
