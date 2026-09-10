import type { IDb } from '@zerospin/core/drizzle/types';
/*
 * System-worker annotation:
 * Persists one completed telemetry batch atomically. Stable logger IDs make
 * retries idempotent, and retention removes all owned rows for old traces.
 */
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, type IAnyError } from '@zerospin/error';
import type { ITelemetryBatch } from '@zerospin/logger';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { SystemLogRepoDb } from '../systemLogRepoDbConfig.js';

import { appendTelemetryBatchTx } from './appendTelemetryBatchTx.js';

/*
 * Linked RPC handlers persist completed telemetry batches in SystemLogRepo.
 * Stable record IDs make retries idempotent, and retention removes old trace
 * links, logs, and spans in the same transaction as the incoming batch.
 *
 * 1. Validate the telemetry deployment ID.
 * 2. Open the batch and retention transaction.
 * 3. Retain spans idempotently.
 * 4. Retain log records idempotently.
 * 5. Retain trace links idempotently.
 * 6. Prune data belonging to traces beyond retention.
 */
export const appendTelemetryBatch = Effect.fn(
  'SystemLogRepo.appendTelemetryBatch',
)(function* (props: {
  batch: ITelemetryBatch;
  db: IDb;
  systemId: string;
}): Effect.fn.Return<void, IAnyError> {
  const { batch, db, systemId } = props;

  // 1 — decode the bound system abbreviation ID
  const decodedSystemId = yield* Schema.decodeUnknownEffect(
    Schema.toType(makeAbbreviationIdSchema(coreAbbreviations.system)),
  )(systemId).pipe(
    mapParseError({
      code: 'failed-to-decode-telemetry-batch-system-id',
      prefix: 'Failed to decode SystemLogRepo telemetry systemId',
      extra: { systemId },
    }),
  );

  // 2 — commit incoming records and trace cleanup together
  yield* appendTelemetryBatchTx({ batch, decodedSystemId }).pipe(
    Effect.provideService(SystemLogRepoDb, db),
  );
});
