/*
 * System-worker annotation:
 * Atomically promotes one prepared deploy to generation-local admission. The
 * caller owns the external activation reservation and final stable promotion.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { and, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

export const openGeneration = Effect.fn('SystemRepo.openGeneration')(
  function* (props: {
    db: IDb;
    deployId: string;
    generationId: string;
    generationStateTable: IAnyDrizzleSchema;
    generationStateColumns: Readonly<{
      generationId: AnyColumn;
      preparingDeployId: AnyColumn;
      readiness: AnyColumn;
    }>;
  }) {
    const {
      db,
      deployId,
      generationId,
      generationStateColumns,
      generationStateTable,
    } = props;

    // Checkpoint 1: opening never creates or repairs preparation state.
    const rawGenerationState = yield* Effect.try({
      try: () =>
        db
          .select()
          .from(generationStateTable)
          .where(eq(generationStateColumns.generationId, generationId))
          .get(),
      catch: ZerospinError.catch({
        code: 'generation-open-state-read-failed',
        message: 'Failed to read generation state before opening admission',
        extra: { deployId, generationId },
      }),
    });
    if (rawGenerationState === undefined) {
      return yield* new ZerospinError({
        code: 'generation-open-not-prepared',
        message: 'The generation cannot open before it is prepared',
        extra: { deployId, generationId },
      });
    }

    const generationState = yield* Schema.decodeUnknown(
      Schema.Struct({
        generationId: Schema.String,
        activeDeployId: Schema.NullOr(Schema.String),
        preparingDeployId: Schema.NullOr(Schema.String),
        readiness: Schema.Literal('initializing', 'ready', 'failed'),
        admission: Schema.Literal('closed', 'open', 'draining', 'drained'),
        preparingSystemSpec: Schema.NullOr(Schema.String),
      }),
    )(rawGenerationState).pipe(
      mapParseError({
        code: 'generation-open-state-invalid',
        prefix: 'Stored generation state is invalid before opening admission',
        extra: { deployId, generationId },
      }),
    );

    // Checkpoint 2: a repeated in-flight call for the same already-open deploy
    // is idempotent. A different deploy can never borrow that result.
    if (
      generationState.activeDeployId === deployId &&
      generationState.preparingDeployId === null &&
      generationState.readiness === 'ready' &&
      generationState.admission === 'open'
    ) {
      return { deployId, generationId };
    }

    if (generationState.readiness !== 'ready') {
      return yield* new ZerospinError({
        code: 'generation-open-not-ready',
        message: 'The generation cannot open until preparation is ready',
        extra: {
          deployId,
          generationId,
          readiness: generationState.readiness,
        },
      });
    }
    if (generationState.preparingDeployId !== deployId) {
      return yield* new ZerospinError({
        code: 'generation-open-deploy-mismatch',
        message: 'The deploy does not own this generation preparation',
        extra: {
          deployId,
          generationId,
          preparingDeployId: generationState.preparingDeployId,
          activeDeployId: generationState.activeDeployId,
        },
      });
    }
    if (generationState.preparingSystemSpec === null) {
      return yield* new ZerospinError({
        code: 'generation-open-system-spec-missing',
        message: 'The prepared generation has no candidate SystemSpec',
        extra: { deployId, generationId },
      });
    }

    // Checkpoint 3: the candidate SystemSpec and deploy admission move together.
    yield* Effect.try({
      try: () =>
        db
          .update(generationStateTable)
          .set({
            activeDeployId: deployId,
            preparingDeployId: null,
            admission: 'open',
            activeSystemSpec: generationState.preparingSystemSpec,
            preparingSystemSpec: null,
            failure: null,
            openedAt: new Date(),
          })
          .where(
            and(
              eq(generationStateColumns.generationId, generationId),
              eq(generationStateColumns.preparingDeployId, deployId),
              eq(generationStateColumns.readiness, 'ready'),
            ),
          )
          .run(),
      catch: ZerospinError.catch({
        code: 'generation-open-write-failed',
        message: 'Failed to open generation admission',
        extra: { deployId, generationId },
      }),
    });

    // Checkpoint 4: verify the postcondition rather than trusting a stale update.
    const openedGenerationState = yield* Effect.try({
      try: () =>
        db
          .select()
          .from(generationStateTable)
          .where(eq(generationStateColumns.generationId, generationId))
          .get(),
      catch: ZerospinError.catch({
        code: 'generation-open-verification-read-failed',
        message: 'Failed to verify opened generation admission',
        extra: { deployId, generationId },
      }),
    });
    const opened = yield* Schema.decodeUnknown(
      Schema.Struct({
        activeDeployId: Schema.NullOr(Schema.String),
        preparingDeployId: Schema.NullOr(Schema.String),
        readiness: Schema.Literal('initializing', 'ready', 'failed'),
        admission: Schema.Literal('closed', 'open', 'draining', 'drained'),
      }),
    )(openedGenerationState).pipe(
      mapParseError({
        code: 'generation-open-verification-invalid',
        prefix: 'Opened generation state is invalid',
        extra: { deployId, generationId },
      }),
    );
    if (
      opened.activeDeployId !== deployId ||
      opened.preparingDeployId !== null ||
      opened.readiness !== 'ready' ||
      opened.admission !== 'open'
    ) {
      return yield* new ZerospinError({
        code: 'generation-open-conflict',
        message: 'Generation admission changed while the deploy was opening',
        extra: {
          deployId,
          generationId,
          activeDeployId: opened.activeDeployId,
          preparingDeployId: opened.preparingDeployId,
          readiness: opened.readiness,
          admission: opened.admission,
        },
      });
    }

    return { deployId, generationId };
  },
);
