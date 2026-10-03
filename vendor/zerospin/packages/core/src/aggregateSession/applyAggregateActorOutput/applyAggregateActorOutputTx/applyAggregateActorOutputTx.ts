import {
  makeZerospinError,
  mapParseError,
  PublicFailureSchema,
  type IAnyError,
} from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { EncodedAppliedOperationSchema } from '../../../contracts/encodeAppliedOperation.ts';
import { makeTx } from '../../../drizzle/make/makeTx.ts';
import type { ITx } from '../../../drizzle/types.ts';
import { upsertHelper } from '../../../drizzle/upsertHelper.ts';
import { ActorDeltaSchema } from '../../../models/ActorDeltaSchema.ts';
import type {
  IAnyModels,
  IEncodedResourceShape,
} from '../../../models/types.ts';
import { getByKeyOrThrow } from '../../../utils/getByKeyOrThrow.ts';
import { replayPendingCommandsTx } from '../../replayPendingCommandsTx.ts';
import { sessionRepoDbConfig } from '../../sessionRepoDbConfig.ts';
import type {
  IActorDelta,
  IAggregateActorOutput,
  IAggregateSessionDefinition,
  ISessionId,
} from '../../types.ts';
import { applyOperationInverseTx } from '../applyOperationInverseTx/applyOperationInverseTx.ts';
import { decodeAppliedOperation } from '../decodeAppliedOperation/decodeAppliedOperation.ts';

/** Atomically reconcile selected input with the optimistic journal and advance definition progress. */
export const applyAggregateActorOutputTx = makeTx(
  'applyAggregateActorOutputTx',
)(function* (
  tx: ITx,
  props: {
    sessionId: ISessionId;
    command: IAggregateActorOutput;
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
  const local = tx
    .select()
    .from(sessionRepoDbConfig.schema.commands)
    .where(eq(sessionRepoDbConfig.schema.commands.id, command.command.id))
    .get();
  const encodedDelta = Schema.encodeSync(
    Schema.fromJsonString(ActorDeltaSchema),
  )(command.command.delta);
  const encodedFailure =
    command.command.failure === null
      ? null
      : Schema.encodeSync(Schema.fromJsonString(PublicFailureSchema))(
          command.command.failure,
        );
  if (
    local !== undefined &&
    (local.commandName !== command.command.commandName ||
      (local.executedIndex === command.executedIndex &&
        (local.executedHash !== command.executedHash ||
          local.actorDelta !== encodedDelta ||
          local.failure !== encodedFailure)))
  ) {
    return yield* makeZerospinError('aggregate-session-outcome-conflict');
  }
  const covered = command.executedIndex <= metadata.executedIndex;
  if (
    command.executedIndex === metadata.executedIndex &&
    command.executedHash !== metadata.executedHash
  ) {
    return yield* makeZerospinError('aggregate-session-checkpoint-conflict');
  }
  if (covered && (local === undefined || local.executedIndex !== null)) {
    return 'duplicate';
  }
  if (!covered && command.executedIndex !== metadata.executedIndex + 1) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-session-command-index-gap',
        message: 'Session output is not the next definition position',
      }),
    );
  }
  if (!covered && command.aggregateIndex < metadata.aggregateIndex) {
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
  // operation newest-first to expose the last authoritative base.
  {
    for (const activeCommand of [...activeCommands].reverse()) {
      const operationRow = tx
        .select()
        .from(sessionRepoDbConfig.schema.optimisticAppliedOperations)
        .where(
          eq(
            sessionRepoDbConfig.schema.optimisticAppliedOperations.commandId,
            activeCommand.id,
          ),
        )
        .get();
      if (operationRow === undefined) {
        continue;
      }
      const encodedOperations = yield* Schema.decodeEffect(
        Schema.fromJsonString(Schema.Array(EncodedAppliedOperationSchema)),
      )(operationRow.operations).pipe(
        mapParseError({
          code: 'session-optimistic-operations-decode-failed',
          prefix: 'Failed to decode optimistic session operations',
        }),
      );
      for (const encodedOperation of [...encodedOperations].reverse()) {
        const model = yield* getByKeyOrThrow({
          record: models,
          key: encodedOperation.modelName,
          recordKind: 'definition models',
        });
        const decodedOperation = yield* decodeAppliedOperation({
          operation: encodedOperation,
          model,
        });
        yield* applyOperationInverseTx({ tx, operation: decodedOperation });
      }
    }
  }

  // 5 — Apply the authoritative actorDelta and resolve its originating command.
  {
    for (const resource of covered ? [] : resourceRows) {
      const model = yield* getByKeyOrThrow({
        record: models,
        key: resource.modelName,
        recordKind: 'definition models',
      });
      upsertHelper({ table: model.drizzleSchema, tx, values: resource });
    }
    for (const removedRef of covered ? [] : actorDelta.deleted) {
      const model = yield* getByKeyOrThrow({
        record: models,
        key: removedRef.modelName,
        recordKind: 'definition models',
      });
      tx.delete(model.drizzleSchema)
        .where(eq(model.drizzleSchema.id, removedRef.id))
        .run();
    }
    if (local !== undefined && local.executedIndex === null) {
      tx.update(sessionRepoDbConfig.schema.commands)
        .set({
          executedIndex: command.executedIndex,
          aggregateIndex: command.aggregateIndex,
          executedHash: command.executedHash,
          actorDelta: encodedDelta,
          failure: encodedFailure,
          pushIndex: local.pushIndex ?? command.aggregateIndex,
        })
        .where(eq(sessionRepoDbConfig.schema.commands.id, command.command.id))
        .run();
      tx.delete(sessionRepoDbConfig.schema.optimisticAppliedOperations)
        .where(
          eq(
            sessionRepoDbConfig.schema.optimisticAppliedOperations.commandId,
            command.command.id,
          ),
        )
        .run();
    }
  }

  // 6 — Derive pending commands again over the new authoritative base.
  yield* replayPendingCommandsTx({ tx, definition });

  // 7 — Advance definition output order, hash, and its consumed aggregate watermark.
  if (!covered) {
    tx.update(sessionRepoDbConfig.schema.sessionMetadata)
      .set({
        aggregateIndex: command.aggregateIndex,
        executedIndex: command.executedIndex,
        executedHash: command.executedHash,
      })
      .where(
        eq(sessionRepoDbConfig.schema.sessionMetadata.sessionId, sessionId),
      )
      .run();
  }

  // 8 — Reaching here means resource, journal, optimism, and frontier rows
  // committed together; duplicate paths returned before operation.
  return 'applied';
});
