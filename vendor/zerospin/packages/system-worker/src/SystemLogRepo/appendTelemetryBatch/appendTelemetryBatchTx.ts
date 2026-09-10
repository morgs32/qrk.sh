import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { ISystemId } from '@zerospin/core/system/types';
import type { ITelemetryBatch } from '@zerospin/logger';
import { sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import {
  SystemLogRepoDb,
  systemLogRepoDbConfig,
} from '../systemLogRepoDbConfig.js';

const maxTraces = 1000;

/** Retain incoming telemetry and prune traces beyond retention in the same transaction. */
export const appendTelemetryBatchTx = makeTx(
  'SystemLogRepo.appendTelemetryBatchTx',
  SystemLogRepoDb,
)(function* (props: { batch: ITelemetryBatch; decodedSystemId: ISystemId }) {
  const { batch, decodedSystemId } = props;

  const tx = yield* SystemLogRepoDb.Tx;
  yield* Effect.void;

  // 3 — encode attributes and bind systemId before inserting
  for (const span of batch.spans) {
    tx.insert(systemLogRepoDbConfig.schema.telemetrySpans)
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
        systemId: decodedSystemId,
      })
      .onConflictDoNothing()
      .run();
  }

  // 4 — encode payloads and bind systemId before inserting
  for (const log of batch.logs) {
    tx.insert(systemLogRepoDbConfig.schema.telemetryLogs)
      .values({
        ...log,
        payload:
          log.payload === null
            ? null
            : Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(
                log.payload,
              ),
        systemId: decodedSystemId,
      })
      .onConflictDoNothing()
      .run();
  }

  // 5 — insert the original links with the bound systemId
  for (const link of batch.links) {
    tx.insert(systemLogRepoDbConfig.schema.telemetryLinks)
      .values({
        ...link,
        systemId: decodedSystemId,
      })
      .onConflictDoNothing()
      .run();
  }

  // 6 — delete links, then logs, then spans outside the newest 1000 traces
  tx.run(sql`
            DELETE FROM ${systemLogRepoDbConfig.schema.telemetryLinks}
            WHERE ${systemLogRepoDbConfig.schema.telemetryLinks.traceId} IN (
              SELECT ${systemLogRepoDbConfig.schema.telemetrySpans.traceId}
              FROM ${systemLogRepoDbConfig.schema.telemetrySpans}
              GROUP BY ${systemLogRepoDbConfig.schema.telemetrySpans.traceId}
              ORDER BY MAX(${systemLogRepoDbConfig.schema.telemetrySpans.endedAt}) DESC,
                ${systemLogRepoDbConfig.schema.telemetrySpans.traceId} DESC
              LIMIT -1 OFFSET ${maxTraces}
            )
          `);
  tx.run(sql`
            DELETE FROM ${systemLogRepoDbConfig.schema.telemetryLogs}
            WHERE ${systemLogRepoDbConfig.schema.telemetryLogs.traceId} IN (
              SELECT ${systemLogRepoDbConfig.schema.telemetrySpans.traceId}
              FROM ${systemLogRepoDbConfig.schema.telemetrySpans}
              GROUP BY ${systemLogRepoDbConfig.schema.telemetrySpans.traceId}
              ORDER BY MAX(${systemLogRepoDbConfig.schema.telemetrySpans.endedAt}) DESC,
                ${systemLogRepoDbConfig.schema.telemetrySpans.traceId} DESC
              LIMIT -1 OFFSET ${maxTraces}
            )
          `);
  tx.run(sql`
            DELETE FROM ${systemLogRepoDbConfig.schema.telemetrySpans}
            WHERE ${systemLogRepoDbConfig.schema.telemetrySpans.traceId} IN (
              SELECT ${systemLogRepoDbConfig.schema.telemetrySpans.traceId}
              FROM ${systemLogRepoDbConfig.schema.telemetrySpans}
              GROUP BY ${systemLogRepoDbConfig.schema.telemetrySpans.traceId}
              ORDER BY MAX(${systemLogRepoDbConfig.schema.telemetrySpans.endedAt}) DESC,
                ${systemLogRepoDbConfig.schema.telemetrySpans.traceId} DESC
              LIMIT -1 OFFSET ${maxTraces}
            )
          `);
});
