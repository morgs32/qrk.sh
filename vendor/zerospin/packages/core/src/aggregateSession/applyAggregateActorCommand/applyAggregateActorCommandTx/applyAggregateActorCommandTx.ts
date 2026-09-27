import {
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { eq, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { EncodedAppliedMutationSchema } from '../../../contracts/encodeAppliedMutation.ts';
import { makeTx } from '../../../drizzle/make/makeTx.ts';
import type { ITx } from '../../../drizzle/types.ts';
import { upsertHelper } from '../../../drizzle/upsertHelper.ts';
import type {
  IAnyModels,
  IEncodedResourceShape,
} from '../../../models/types.ts';
import { getByKeyOrThrow } from '../../../utils/getByKeyOrThrow.ts';
import { replayPendingCommandsTx } from '../../replayPendingCommandsTx.ts';
import { sessionRepoDbConfig } from '../../sessionRepoDbConfig.ts';
import type {
  IActorDelta,
  IAggregateActorCommand,
  IAggregateSessionDefinition,
  ISessionId,
} from '../../types.ts';
import { applyMutationInverseTx } from '../applyMutationInverseTx/applyMutationInverseTx.ts';
import { decodeAppliedMutation } from '../decodeAppliedMutation/decodeAppliedMutation.ts';

/** Atomically reconcile selected input with the optimistic journal and advance definition progress. */
export const applyAggregateActorCommandTx = makeTx(
  'applyAggregateActorCommandTx',
)(function* (
  tx: ITx,
  props: {
    sessionId: ISessionId;
    command: IAggregateActorCommand;
    models: IAnyModels;
    definition: IAggregateSessionDefinition;
    resourceRows: readonly IEncodedResourceShape[];
    actorDelta: IActorDelta;
  },
): Effect.fn.Return<'applied' | 'duplicate', IAnyError> {
  const { sessionId, command, models, resourceRows, actorDelta, definition } =
    props;

  // 3 — The session metadata decides exact duplicates and requires the next
  // definition position before any rows are changed.
  const metadata = tx
    .select()
    .from(sessionRepoDbConfig.schema.sessionMetadata)
    .where(eq(sessionRepoDbConfig.schema.sessionMetadata.sessionId, sessionId))
    .get();
  if (metadata === undefined) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'session-metadata-missing',
        message: 'Session metadata must exist before command delivery',
      }),
    );
  }
  if (command.executedIndex <= metadata.executedIndex) return 'duplicate';
  if (command.executedIndex !== metadata.executedIndex + 1) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-session-command-index-gap',
        message: 'Session output is not the next definition position',
      }),
    );
  }
  if (command.aggregateIndex < metadata.aggregateIndex) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-session-command-watermark-regression',
        message: 'Session output regresses the consumed aggregate position',
      }),
    );
  }
  yield* Effect.sync(() => {
    tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
  });

  const activeCommands = tx
    .select()
    .from(sessionRepoDbConfig.schema.commands)
    // Renewed session indexes cannot order retained older occurrences.
    .orderBy(
      sql`${sessionRepoDbConfig.schema.commands.pushIndex} IS NULL`,
      sessionRepoDbConfig.schema.commands.pushIndex,
      sql`rowid`,
    )
    .all();

  // 4 — Each actor command first undoes every optimistic
  // mutation newest-first to expose the last authoritative base.
  {
    for (const activeCommand of [...activeCommands].reverse()) {
      const mutationRow = tx
        .select()
        .from(sessionRepoDbConfig.schema.optimisticAppliedMutations)
        .where(
          eq(
            sessionRepoDbConfig.schema.optimisticAppliedMutations.commandId,
            activeCommand.id,
          ),
        )
        .get();
      if (mutationRow === undefined) continue;
      const encodedMutations = yield* Schema.decodeEffect(
        Schema.fromJsonString(Schema.Array(EncodedAppliedMutationSchema)),
      )(mutationRow.mutations).pipe(
        mapParseError({
          code: 'session-optimistic-mutations-decode-failed',
          prefix: 'Failed to decode optimistic session mutations',
        }),
      );
      for (const encodedMutation of [...encodedMutations].reverse()) {
        const model = yield* getByKeyOrThrow({
          record: models,
          key: encodedMutation.modelName,
          recordKind: 'definition models',
        });
        const decodedMutation = yield* decodeAppliedMutation({
          mutation: encodedMutation,
          model,
        });
        yield* applyMutationInverseTx({ tx, mutation: decodedMutation });
      }
    }
  }

  // 5 — Apply the authoritative actorDelta and resolve its originating command.
  {
    for (const resource of resourceRows) {
      const model = yield* getByKeyOrThrow({
        record: models,
        key: resource.modelName,
        recordKind: 'definition models',
      });
      upsertHelper({ table: model.drizzleSchema, tx, values: resource });
    }
    for (const removedRef of actorDelta.deleted) {
      const model = yield* getByKeyOrThrow({
        record: models,
        key: removedRef.modelName,
        recordKind: 'definition models',
      });
      tx.delete(model.drizzleSchema)
        .where(eq(model.drizzleSchema.id, removedRef.id))
        .run();
    }
    if (command.admission !== null && command.execution !== null) {
      const fields = makeEffectSchema(
        sessionRepoDbConfig.tables.commands.shape,
      ).fields;
      const delivered = yield* Schema.encodeEffect(
        Schema.Struct({
          actorDelta: fields.actorDelta,
          admission: fields.admission,
          execution: fields.execution,
        }),
      )({
        actorDelta: command.actorDelta,
        admission: command.admission,
        execution: command.execution,
      }).pipe(
        mapParseError({
          code: 'aggregate-actor-command-encode-failed',
          prefix: 'Invalid actor command',
        }),
      );
      tx.update(sessionRepoDbConfig.schema.commands)
        .set({
          executedIndex: command.executedIndex,
          aggregateIndex: command.aggregateIndex,
          executedHash: command.executedHash,
          actorDelta: delivered.actorDelta,
          admission: delivered.admission,
          execution: delivered.execution,
          pushIndex: command.aggregateIndex,
        })
        .where(eq(sessionRepoDbConfig.schema.commands.id, command.id))
        .run();
      tx.delete(sessionRepoDbConfig.schema.optimisticAppliedMutations)
        .where(
          eq(
            sessionRepoDbConfig.schema.optimisticAppliedMutations.commandId,
            command.id,
          ),
        )
        .run();
    }
  }

  // 6 — Derive pending commands again over the new authoritative base.
  yield* replayPendingCommandsTx({ tx, definition });

  // 7 — Advance definition output order, hash, and its consumed aggregate watermark.
  tx.update(sessionRepoDbConfig.schema.sessionMetadata)
    .set({
      aggregateIndex: command.aggregateIndex,
      executedIndex: command.executedIndex,
      executedHash: command.executedHash,
    })
    .where(eq(sessionRepoDbConfig.schema.sessionMetadata.sessionId, sessionId))
    .run();

  // 8 — Reaching here means resource, journal, optimism, and frontier rows
  // committed together; duplicate paths returned before mutation.
  return 'applied';
});
