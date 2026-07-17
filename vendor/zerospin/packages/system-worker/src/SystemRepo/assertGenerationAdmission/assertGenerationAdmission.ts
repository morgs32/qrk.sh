/*
 * System-worker annotation:
 * Enforces generation-local deploy admission before an ordinary SystemWorker
 * RPC is allowed to resolve any generation-scoped repo.
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
  deployId: string;
  mode: 'read' | 'write';
}) {
  const {
    db,
    deployId,
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
      extra: { deployId, generationId, mode },
    }),
  });
  if (rawGenerationState === undefined) {
    return yield* new ZerospinError({
      code: 'generation-not-prepared',
      message: 'The requested generation has not been prepared',
      extra: { deployId, generationId, mode },
    });
  }

  // Checkpoint 2: corrupt lifecycle fields are an admission failure, never a default.
  const generationState = yield* Schema.decodeUnknown(
    Schema.Struct({
      generationId: Schema.String,
      activeDeployId: Schema.NullOr(Schema.String),
      readiness: Schema.Literal('initializing', 'ready', 'failed'),
      admission: Schema.Literal('closed', 'open', 'draining', 'drained'),
    }),
  )(rawGenerationState).pipe(
    mapParseError({
      code: 'generation-admission-state-invalid',
      prefix: 'Stored generation admission state is invalid',
      extra: { deployId, generationId, mode },
    }),
  );

  if (generationState.generationId !== generationId) {
    return yield* new ZerospinError({
      code: 'generation-admission-identity-mismatch',
      message: 'Stored generation state does not match this SystemRepo',
      extra: {
        deployId,
        generationId,
        storedGenerationId: generationState.generationId,
        mode,
      },
    });
  }
  if (generationState.readiness !== 'ready') {
    return yield* new ZerospinError({
      code: 'generation-not-ready',
      message: 'The requested generation is not ready',
      extra: {
        deployId,
        generationId,
        readiness: generationState.readiness,
        mode,
      },
    });
  }
  if (generationState.activeDeployId !== deployId) {
    return yield* new ZerospinError({
      code: 'generation-deploy-not-active',
      message: 'The capability deploy is not active for this generation',
      extra: {
        deployId,
        generationId,
        activeDeployId: generationState.activeDeployId,
        mode,
      },
    });
  }

  // Checkpoint 3: draining admits existing reads only while accepted writes and
  // outboxes finish. Once drained, ordinary data-plane capabilities are closed;
  // replay and lifecycle reads use their explicit RPCs instead.
  if (
    mode === 'read' &&
    generationState.admission !== 'open' &&
    generationState.admission !== 'draining'
  ) {
    return yield* new ZerospinError({
      code: 'generation-read-admission-closed',
      message: 'Read admission is closed for this generation',
      extra: {
        deployId,
        generationId,
        admission: generationState.admission,
      },
    });
  }
  if (mode === 'write' && generationState.admission !== 'open') {
    return yield* new ZerospinError({
      code: 'generation-write-admission-closed',
      message: 'Write admission is closed for this generation',
      extra: {
        deployId,
        generationId,
        admission: generationState.admission,
      },
    });
  }
});
