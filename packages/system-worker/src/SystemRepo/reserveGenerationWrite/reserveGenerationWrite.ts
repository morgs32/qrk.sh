/*
 * System-worker annotation:
 * Atomically admits one cross-Durable-Object write before SystemWorker resolves
 * its downstream repository. The persisted row is the finite drain lease.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { eq, type AnyColumn } from 'drizzle-orm';
import { Effect } from 'effect';

export const reserveGenerationWrite = Effect.fn(
  'SystemRepo.reserveGenerationWrite',
)(function* (props: {
  db: IDb;
  deployId: string;
  generationId: string;
  operationName: string;
  generationStateTable: IAnyDrizzleSchema;
  generationStateColumns: Readonly<{
    activeDeployId: AnyColumn;
    admission: AnyColumn;
    generationId: AnyColumn;
    readiness: AnyColumn;
  }>;
  generationWriteReservationTable: IAnyDrizzleSchema;
}) {
  const {
    db,
    deployId,
    generationId,
    generationStateColumns,
    generationStateTable,
    generationWriteReservationTable,
    operationName,
  } = props;

  const reservationId = `gwr_${crypto.randomUUID()}`;

  // The lifecycle read and reservation insert share one synchronous SQLite
  // transaction. Freeze therefore sees this row or closes admission first.
  const admissionFailure = yield* Effect.try({
    try: (): IAnyError | null =>
      db.transaction(tx => {
        const generationState = tx
          .select({
            generationId: generationStateColumns.generationId,
            activeDeployId: generationStateColumns.activeDeployId,
            readiness: generationStateColumns.readiness,
            admission: generationStateColumns.admission,
          })
          .from(generationStateTable)
          .where(eq(generationStateColumns.generationId, generationId))
          .get();

        if (generationState === undefined) {
          return new ZerospinError({
            code: 'generation-not-prepared',
            message: 'The requested generation has not been prepared',
            extra: { deployId, generationId, mode: 'write', operationName },
          });
        }
        if (generationState.generationId !== generationId) {
          return new ZerospinError({
            code: 'generation-admission-identity-mismatch',
            message: 'Stored generation state does not match this SystemRepo',
            extra: {
              deployId,
              generationId,
              storedGenerationId: generationState.generationId,
              mode: 'write',
              operationName,
            },
          });
        }
        if (generationState.readiness !== 'ready') {
          return new ZerospinError({
            code: 'generation-not-ready',
            message: 'The requested generation is not ready',
            extra: {
              deployId,
              generationId,
              readiness: generationState.readiness,
              mode: 'write',
              operationName,
            },
          });
        }
        if (generationState.activeDeployId !== deployId) {
          return new ZerospinError({
            code: 'generation-deploy-not-active',
            message: 'The capability deploy is not active for this generation',
            extra: {
              deployId,
              generationId,
              activeDeployId: generationState.activeDeployId,
              mode: 'write',
              operationName,
            },
          });
        }
        if (generationState.admission !== 'open') {
          return new ZerospinError({
            code: 'generation-write-admission-closed',
            message: 'Write admission is closed for this generation',
            extra: {
              deployId,
              generationId,
              admission: generationState.admission,
              operationName,
            },
          });
        }

        tx.insert(generationWriteReservationTable)
          .values({
            reservationId,
            deployId,
            operationName,
            reservedAt: new Date(),
          })
          .run();

        return null;
      }),
    catch: ZerospinError.catch({
      code: 'generation-write-reservation-write-failed',
      message: 'Failed to persist the admitted generation write reservation',
      extra: { deployId, generationId, operationName, reservationId },
    }),
  });

  if (ZerospinError.isZerospinError(admissionFailure)) {
    return yield* admissionFailure;
  }

  return reservationId;
});
