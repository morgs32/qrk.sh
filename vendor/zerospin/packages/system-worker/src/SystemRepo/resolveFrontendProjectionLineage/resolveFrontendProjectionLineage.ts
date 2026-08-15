/*
 * Frontend archive segments are not generation replay authority. A current
 * projection starts from the destination generation's replayed immutable
 * ledgers, so lineage resolution now owns only the generation read fence.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type {
  IAggregateId,
  IAnyDrizzleSchema,
} from '@zerospin/core/models/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

export const resolveFrontendProjectionLineage = Effect.fn(
  'SystemRepo.resolveFrontendProjectionLineage',
)(function* (props: {
  db: IDb;
  generationId: string;
  target:
    | Readonly<{
        kind: 'aggregate';
        aggregateId: IAggregateId;
        aggregateName: string;
        userId: string;
        frontendName: string;
      }>
    | Readonly<{
        kind: 'service';
        serviceName: string;
        userId: string;
        frontendName: string;
      }>;
  generationStateTable: IAnyDrizzleSchema;
  generationStateColumns: Readonly<{
    generationId: AnyColumn;
  }>;
}) {
  const rawGenerationState = yield* Effect.try({
    try: () =>
      props.db
        .select()
        .from(props.generationStateTable)
        .where(
          eq(props.generationStateColumns.generationId, props.generationId),
        )
        .get(),
    catch: ZerospinError.catch({
      code: 'aggregate-frontend-lineage-generation-state-read-failed',
      message:
        'Failed to read generation state while resolving frontend lineage',
      extra: { generationId: props.generationId, kind: props.target.kind },
    }),
  });
  if (rawGenerationState === undefined) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-lineage-generation-state-required',
      message:
        'Frontend lineage cannot be resolved before generation preparation',
      extra: { generationId: props.generationId, kind: props.target.kind },
    });
  }
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
      code: 'aggregate-frontend-lineage-generation-state-invalid',
      prefix:
        'Stored generation state is invalid while resolving frontend lineage',
      extra: { generationId: props.generationId, kind: props.target.kind },
    }),
  );
  if (
    generationState.generationId !== props.generationId ||
    (generationState.phase !== 'open' && generationState.phase !== 'draining')
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-lineage-read-admission-closed',
      message: 'Frontend lineage requires an open or draining generation',
      extra: {
        generationId: props.generationId,
        storedGenerationId: generationState.generationId,
        phase: generationState.phase,
      },
    });
  }

  return { predecessor: null };
});
