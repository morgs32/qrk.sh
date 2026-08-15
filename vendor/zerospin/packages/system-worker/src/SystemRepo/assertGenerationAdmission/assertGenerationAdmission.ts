/*
 * System-worker annotation:
 * Enforces generation read or write admission before an ordinary SystemWorker
 * RPC resolves a generation-scoped Repo.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

export const assertGenerationAdmission = Effect.fn(
  'SystemRepo.assertGenerationAdmission',
)(function* (props: {
  db: IDb;
  generationId: string;
  generationStateTable: IAnyDrizzleSchema;
  generationStateColumns: Readonly<{
    generationId: AnyColumn;
  }>;
  mode: 'read' | 'write';
}) {
  const {
    db,
    generationId,
    generationStateColumns,
    generationStateTable,
    mode,
  } = props;

  // Checkpoint 1: absence is closed. Ordinary calls never bootstrap lifecycle state.
  const rawGenerationState = yield* Effect.try({
    try: () =>
      db
        .select()
        .from(generationStateTable)
        .where(eq(generationStateColumns.generationId, generationId))
        .get(),
    catch: ZerospinError.catch({
      code: 'generation-admission-read-failed',
      message: 'Failed to read generation admission state',
      extra: { generationId, mode },
    }),
  });
  if (rawGenerationState === undefined) {
    return yield* new ZerospinError({
      code: 'generation-not-prepared',
      message: 'The requested generation has not been prepared',
      extra: { generationId, mode },
    });
  }

  // Checkpoint 2: corrupt lifecycle fields are an admission failure, never a default.
  const generationState = yield* Schema.decodeUnknown(
    Schema.Struct({
      generationId: Schema.String,
      phase: Schema.Literal(
        'closed',
        'migrating',
        'open',
        'draining',
        'retired',
      ),
    }),
  )(rawGenerationState).pipe(
    mapParseError({
      code: 'generation-admission-state-invalid',
      prefix: 'Stored generation admission state is invalid',
      extra: { generationId, mode },
    }),
  );

  if (generationState.generationId !== generationId) {
    return yield* new ZerospinError({
      code: 'generation-admission-identity-mismatch',
      message:
        'Stored generation state does not match the requested generation',
      extra: {
        generationId,
        storedGenerationId: generationState.generationId,
        mode,
      },
    });
  }
  // Checkpoint 3: source reads remain admitted through the finite drain. The
  // atomic retired transition is the stale-capability fence.
  if (
    mode === 'read' &&
    generationState.phase !== 'open' &&
    generationState.phase !== 'draining'
  ) {
    return yield* new ZerospinError({
      code: 'generation-read-admission-closed',
      message: 'Read admission is closed for this generation',
      extra: {
        generationId,
        phase: generationState.phase,
      },
    });
  }
  if (mode === 'write' && generationState.phase !== 'open') {
    return yield* new ZerospinError({
      code: 'generation-write-admission-closed',
      message: 'Write admission is closed for this generation',
      extra: {
        generationId,
        phase: generationState.phase,
      },
    });
  }
});
