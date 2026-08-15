/*
 * Applies the destination-generation portion of atomic deploy promotion. The
 * caller supplies the same local transaction that moves system selection.
 */

import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { and, eq, ne, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

export const openGeneration = Effect.fn('SystemRepo.openGeneration')(
  function* (props: {
    db: IDb | ITx;
    deployId: string;
    generationId: string;
    generationStateTable: IAnyDrizzleSchema;
    generationStateColumns: Readonly<{
      phase: AnyColumn;
      generationId: AnyColumn;
      preparingDeployId: AnyColumn;
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
        code: 'generation-open-state-read-failed',
        message: 'Failed to read prepared generation state before promotion',
        extra: {
          deployId: props.deployId,
          generationId: props.generationId,
        },
      }),
    });
    if (rawGenerationState === undefined) {
      return yield* new ZerospinError({
        code: 'generation-open-not-prepared',
        message: 'The generation cannot open before it is prepared',
        extra: {
          deployId: props.deployId,
          generationId: props.generationId,
        },
      });
    }
    const generationState = yield* Schema.decodeUnknown(
      Schema.Struct({
        activeDeployId: Schema.NullOr(Schema.String),
        preparingDeployId: Schema.NullOr(Schema.String),
        phase: Schema.Literal(
          'closed',
          'migrating',
          'open',
          'draining',
          'retired',
        ),
        readyAt: Schema.NullOr(Schema.DateFromSelf),
        preparingSystemSpec: Schema.NullOr(Schema.String),
      }),
    )(rawGenerationState).pipe(
      mapParseError({
        code: 'generation-open-state-invalid',
        prefix: 'Stored generation state is invalid before promotion',
        extra: {
          deployId: props.deployId,
          generationId: props.generationId,
        },
      }),
    );

    if (
      generationState.phase === 'open' &&
      generationState.activeDeployId === props.deployId &&
      generationState.preparingDeployId === null
    ) {
      return { deployId: props.deployId, generationId: props.generationId };
    }
    if (
      generationState.readyAt === null ||
      (generationState.phase !== 'closed' &&
        generationState.phase !== 'migrating' &&
        generationState.phase !== 'open') ||
      generationState.preparingDeployId !== props.deployId ||
      generationState.preparingSystemSpec === null
    ) {
      return yield* new ZerospinError({
        code: 'generation-open-not-ready',
        message:
          'Only the exact ready preparing deploy may open its destination generation',
        extra: {
          deployId: props.deployId,
          generationId: props.generationId,
          preparingDeployId: generationState.preparingDeployId,
          readyAt: generationState.readyAt,
          phase: generationState.phase,
        },
      });
    }

    const unrelatedOpen = props.db
      .select({ generationId: props.generationStateColumns.generationId })
      .from(props.generationStateTable)
      .where(
        and(
          eq(props.generationStateColumns.phase, 'open'),
          ne(props.generationStateColumns.generationId, props.generationId),
        ),
      )
      .get();
    if (unrelatedOpen !== undefined && generationState.phase !== 'open') {
      return yield* new ZerospinError({
        code: 'generation-open-conflict',
        message: 'Another generation is already open for this System',
        extra: {
          deployId: props.deployId,
          generationId: props.generationId,
          openGenerationId: unrelatedOpen.generationId,
        },
      });
    }

    yield* Effect.try({
      try: () =>
        props.db
          .update(props.generationStateTable)
          .set({
            activeDeployId: props.deployId,
            preparingDeployId: null,
            activeSystemSpec: generationState.preparingSystemSpec,
            preparingSystemSpec: null,
            phase: 'open',
            openedAt: new Date(),
          })
          .where(
            and(
              eq(props.generationStateColumns.generationId, props.generationId),
              eq(
                props.generationStateColumns.preparingDeployId,
                props.deployId,
              ),
            ),
          )
          .run(),
      catch: ZerospinError.catch({
        code: 'generation-open-write-failed',
        message: 'Failed to open the prepared generation during promotion',
        extra: {
          deployId: props.deployId,
          generationId: props.generationId,
        },
      }),
    });

    return { deployId: props.deployId, generationId: props.generationId };
  },
);
