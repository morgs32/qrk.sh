/*
 * System-worker annotation:
 * Idempotently releases one admitted cross-Durable-Object generation write.
 * Lifecycle admission is deliberately not consulted after freeze closes it.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { ZerospinError } from '@zerospin/error';
import { and, eq, type AnyColumn } from 'drizzle-orm';
import { Effect } from 'effect';

export const releaseGenerationWrite = Effect.fn(
  'SystemRepo.releaseGenerationWrite',
)(function* (props: {
  db: IDb;
  deployId: string;
  generationId: string;
  reservationId: string;
  generationWriteReservationTable: IAnyDrizzleSchema;
  generationWriteReservationColumns: Readonly<{
    deployId: AnyColumn;
    reservationId: AnyColumn;
  }>;
}) {
  const {
    db,
    deployId,
    generationId,
    generationWriteReservationColumns,
    generationWriteReservationTable,
    reservationId,
  } = props;

  // A duplicate release changes zero rows and succeeds. This remains callable
  // while admission is draining or drained so freeze cannot strand a success.
  yield* Effect.try({
    try: () =>
      db
        .delete(generationWriteReservationTable)
        .where(
          and(
            eq(generationWriteReservationColumns.deployId, deployId),
            eq(generationWriteReservationColumns.reservationId, reservationId),
          ),
        )
        .run(),
    catch: ZerospinError.catch({
      code: 'generation-write-reservation-release-failed',
      message: 'Failed to release the admitted generation write reservation',
      extra: { deployId, generationId, reservationId },
    }),
  });
});
