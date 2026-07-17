/*
 * System-worker annotation:
 * Reads the authoritative generation lifecycle row together with its immutable
 * drain bounds and completed target-repo replay summaries.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { asc, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

export const getGenerationState = Effect.fn('SystemRepo.getGenerationState')(
  function* (props: {
    db: IDb;
    generationId: string;
    generationStateTable: IAnyDrizzleSchema;
    generationStateColumns: Readonly<{
      generationId: AnyColumn;
    }>;
    drainBoundsTable: IAnyDrizzleSchema;
    drainBoundsColumns: Readonly<{
      deployId: AnyColumn;
      repoName: AnyColumn;
    }>;
    replayCompletionsTable: IAnyDrizzleSchema;
    replayCompletionsColumns: Readonly<{
      deployId: AnyColumn;
      targetRepoName: AnyColumn;
    }>;
  }) {
    const {
      db,
      drainBoundsColumns,
      drainBoundsTable,
      generationId,
      generationStateColumns,
      generationStateTable,
      replayCompletionsColumns,
      replayCompletionsTable,
    } = props;

    // Checkpoint 1: one generation-scoped SystemRepo may own at most one state row.
    const rawGenerationState = yield* Effect.try({
      try: () =>
        db
          .select()
          .from(generationStateTable)
          .where(eq(generationStateColumns.generationId, generationId))
          .get(),
      catch: ZerospinError.catch({
        code: 'generation-state-read-failed',
        message: 'Failed to read SystemRepo generation state',
        extra: { generationId },
      }),
    });
    if (rawGenerationState === undefined) {
      return null;
    }

    // Checkpoint 2: validate every persisted scalar before it can authorize admission.
    const generationState = yield* Schema.decodeUnknown(
      Schema.Struct({
        generationId: Schema.String,
        prevGenerationId: Schema.NullOr(Schema.String),
        initialDeployId: Schema.String,
        activeDeployId: Schema.NullOr(Schema.String),
        preparingDeployId: Schema.NullOr(Schema.String),
        readiness: Schema.Literal('initializing', 'ready', 'failed'),
        admission: Schema.Literal('closed', 'open', 'draining', 'drained'),
        activeSystemSpec: Schema.NullOr(Schema.String),
        preparingSystemSpec: Schema.NullOr(Schema.String),
        failure: Schema.NullOr(Schema.String),
        createdAt: Schema.DateFromSelf,
        readyAt: Schema.NullOr(Schema.DateFromSelf),
        openedAt: Schema.NullOr(Schema.DateFromSelf),
        drainedAt: Schema.NullOr(Schema.DateFromSelf),
      }),
    )(rawGenerationState).pipe(
      mapParseError({
        code: 'generation-state-invalid',
        prefix: 'Stored SystemRepo generation state is invalid',
        extra: { generationId },
      }),
    );

    // Checkpoint 3: SystemSpec JSON is decoded independently so corrupt control
    // state fails closed instead of being treated as an absent specification.
    const activeSystemSpec =
      generationState.activeSystemSpec === null
        ? null
        : yield* Schema.decodeUnknown(Schema.parseJson(SystemSpecSchema))(
            generationState.activeSystemSpec,
          ).pipe(
            mapParseError({
              code: 'active-system-spec-invalid',
              prefix: 'Stored active SystemSpec is invalid',
              extra: { generationId },
            }),
          );
    const preparingSystemSpec =
      generationState.preparingSystemSpec === null
        ? null
        : yield* Schema.decodeUnknown(Schema.parseJson(SystemSpecSchema))(
            generationState.preparingSystemSpec,
          ).pipe(
            mapParseError({
              code: 'preparing-system-spec-invalid',
              prefix: 'Stored preparing SystemSpec is invalid',
              extra: { generationId },
            }),
          );

    // Checkpoint 4: bounds and summaries are ordered for deterministic status
    // output and deterministic preparation retries.
    const rawDrainBounds =
      generationState.activeDeployId === null
        ? []
        : yield* Effect.try({
            try: () =>
              db
                .select()
                .from(drainBoundsTable)
                .where(
                  eq(
                    drainBoundsColumns.deployId,
                    generationState.activeDeployId,
                  ),
                )
                .orderBy(asc(drainBoundsColumns.repoName))
                .all(),
            catch: ZerospinError.catch({
              code: 'generation-drain-bounds-read-failed',
              message: 'Failed to read generation drain bounds',
              extra: {
                generationId,
                deployId: generationState.activeDeployId,
              },
            }),
          });
    const drainBounds = yield* Schema.decodeUnknown(
      Schema.Array(
        Schema.Struct({
          deployId: Schema.String,
          repoType: Schema.Literal('ServiceBlockRepo', 'AccountBlockRepo'),
          repoName: Schema.String,
          terminalCursor: Schema.NullOr(Schema.String),
          terminalIndex: Schema.NullOr(Schema.Number),
          capturedAt: Schema.DateFromSelf,
        }),
      ),
    )(rawDrainBounds).pipe(
      mapParseError({
        code: 'generation-drain-bounds-invalid',
        prefix: 'Stored generation drain bounds are invalid',
        extra: { generationId },
      }),
    );

    const rawReplayCompletions =
      generationState.preparingDeployId === null
        ? []
        : yield* Effect.try({
            try: () =>
              db
                .select()
                .from(replayCompletionsTable)
                .where(
                  eq(
                    replayCompletionsColumns.deployId,
                    generationState.preparingDeployId,
                  ),
                )
                .orderBy(asc(replayCompletionsColumns.targetRepoName))
                .all(),
            catch: ZerospinError.catch({
              code: 'generation-replay-completions-read-failed',
              message: 'Failed to read generation replay completions',
              extra: {
                generationId,
                deployId: generationState.preparingDeployId,
              },
            }),
          });
    const replayCompletions = yield* Schema.decodeUnknown(
      Schema.Array(
        Schema.Struct({
          deployId: Schema.String,
          repoType: Schema.Literal('ServiceRepo', 'AccountRepo'),
          prevRepoName: Schema.String,
          targetRepoName: Schema.String,
          terminalIndex: Schema.NullOr(Schema.Number),
          blockCount: Schema.Number,
          completedAt: Schema.DateFromSelf,
        }),
      ),
    )(rawReplayCompletions).pipe(
      mapParseError({
        code: 'generation-replay-completions-invalid',
        prefix: 'Stored generation replay completions are invalid',
        extra: { generationId },
      }),
    );

    return {
      ...generationState,
      activeSystemSpec,
      preparingSystemSpec,
      drainBounds,
      replayCompletions,
    };
  },
);
