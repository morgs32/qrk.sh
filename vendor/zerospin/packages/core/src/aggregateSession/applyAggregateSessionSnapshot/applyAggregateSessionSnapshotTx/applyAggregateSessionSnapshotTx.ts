import { makeZerospinError, type IAnyError } from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { AdmissionResultSchema } from '../../../contracts/AdmissionResultSchema.ts';
import { ExecutionResultSchema } from '../../../contracts/ExecutionResultSchema.ts';
import { makeTx } from '../../../drizzle/make/makeTx.ts';
import type { IDb, ITx } from '../../../drizzle/types.ts';
import { ActorDeltaSchema } from '../../../models/ActorDeltaSchema.ts';
import type { IAnyModels } from '../../../models/types.ts';
import { getByKeyOrThrow } from '../../../utils/getByKeyOrThrow.ts';
import {
  replayPendingCommandsTx,
  type IAggregateSessionReplayRequirements,
} from '../../replayPendingCommandsTx.ts';
import { sessionRepoDbConfig } from '../../sessionRepoDbConfig.ts';
import type {
  IAggregateBrowserCommand,
  IAggregateSessionDefinition,
  IAggregateSessionSnapshot,
  ISessionId,
} from '../../types.ts';

type IApplyAggregateSessionSnapshotTxProps<
  DEFINITION extends IAggregateSessionDefinition = IAggregateSessionDefinition,
> = {
  snapshot: IAggregateSessionSnapshot;
  sessionId: ISessionId;
  models: IAnyModels;
  definition: DEFINITION;
  outcomes?: readonly IAggregateBrowserCommand[];
};

/** Replace authoritative definition resources and replay surviving optimism in one transaction. */
export function applyAggregateSessionSnapshotTx<
  DEFINITION extends IAggregateSessionDefinition,
>(
  db: IDb,
  props: IApplyAggregateSessionSnapshotTxProps<DEFINITION>,
): Effect.Effect<
  void,
  IAnyError,
  IAggregateSessionReplayRequirements<DEFINITION>
>;
export function applyAggregateSessionSnapshotTx(
  db: IDb,
  props: IApplyAggregateSessionSnapshotTxProps,
) {
  return applySnapshot(db, props);
}
const applySnapshot = makeTx('applyAggregateSessionSnapshotTx')(function* (
  tx: ITx,
  props: IApplyAggregateSessionSnapshotTxProps,
) {
  const { snapshot, sessionId, models, definition } = props;

  if (props.outcomes !== undefined) {
    if (props.outcomes.length !== snapshot.resolvedThrough) {
      return yield* makeZerospinError('aggregate-session-recovery-incomplete');
    }
    const commands = tx
      .select()
      .from(sessionRepoDbConfig.schema.commands)
      .all();
    for (const command of commands) {
      if (
        command.admissionIndex === null ||
        command.admissionIndex > snapshot.resolvedThrough
      ) {
        continue;
      }
      const outcome = props.outcomes[command.admissionIndex - 1];
      if (
        outcome === undefined ||
        outcome.id !== command.id ||
        outcome.commandName !== command.commandName ||
        outcome.executedIndex > snapshot.executedIndex
      ) {
        return yield* makeZerospinError(
          'aggregate-session-recovery-outcome-mismatch',
        );
      }
      const actorDelta = Schema.encodeSync(
        Schema.fromJsonString(ActorDeltaSchema),
      )(outcome.delta);
      const admission =
        outcome.admission === null
          ? null
          : Schema.encodeSync(Schema.fromJsonString(AdmissionResultSchema))(
              outcome.admission,
            );
      const execution =
        outcome.execution === null
          ? null
          : Schema.encodeSync(Schema.fromJsonString(ExecutionResultSchema))(
              outcome.execution,
            );
      if (
        command.executedIndex !== null &&
        (command.executedIndex !== outcome.executedIndex ||
          command.executedHash !== outcome.executedHash ||
          command.actorDelta !== actorDelta ||
          command.admission !== admission ||
          command.execution !== execution)
      ) {
        return yield* makeZerospinError(
          'aggregate-session-recovery-outcome-conflict',
        );
      }
      tx.update(sessionRepoDbConfig.schema.commands)
        .set({
          executedIndex: outcome.executedIndex,
          aggregateIndex: outcome.aggregateIndex,
          executedHash: outcome.executedHash,
          actorDelta,
          admission,
          execution,
        })
        .where(
          eq(
            sessionRepoDbConfig.schema.commands.sessionIndex,
            command.sessionIndex,
          ),
        )
        .run();
    }
  }
  yield* Effect.sync(() => {
    tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
  });
  tx.delete(sessionRepoDbConfig.schema.optimisticAppliedOperations).run();
  const metadata = tx
    .select()
    .from(sessionRepoDbConfig.schema.sessionMetadata)
    .where(eq(sessionRepoDbConfig.schema.sessionMetadata.sessionId, sessionId))
    .get();

  for (const model of Object.values(models)) {
    tx.delete(model.drizzleSchema).run();
  }
  for (const resource of snapshot.resources) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: resource.modelName,
      recordKind: 'definition models',
    });
    tx.insert(model.drizzleSchema).values(resource).run();
  }
  tx.insert(sessionRepoDbConfig.schema.sessionMetadata)
    .values({
      sessionId,
      actorName: definition.actorName,
      actorVersion: definition.actorVersion,
      nextSessionIndex: metadata?.nextSessionIndex ?? 1,
      changeIndex: metadata?.changeIndex ?? 0,
      aggregateIndex: snapshot.aggregateIndex,
      executedIndex: snapshot.executedIndex,
      executedHash: snapshot.executedHash,
      pushIndex: metadata?.pushIndex ?? 0,
    })
    .onConflictDoUpdate({
      target: sessionRepoDbConfig.schema.sessionMetadata.sessionId,
      set: {
        aggregateIndex: snapshot.aggregateIndex,
        executedIndex: snapshot.executedIndex,
        executedHash: snapshot.executedHash,
        pushIndex: metadata?.pushIndex ?? 0,
      },
    })
    .run();

  yield* replayPendingCommandsTx({ tx, definition });
});
