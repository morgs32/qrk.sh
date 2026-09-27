import { eq, sql } from 'drizzle-orm';
import { Effect } from 'effect';

import { makeTx } from '../../../drizzle/make/makeTx.ts';
import type { ITx } from '../../../drizzle/types.ts';
import type { IAnyModels } from '../../../models/types.ts';
import { getByKeyOrThrow } from '../../../utils/getByKeyOrThrow.ts';
import { replayPendingCommandsTx } from '../../replayPendingCommandsTx.ts';
import { sessionRepoDbConfig } from '../../sessionRepoDbConfig.ts';
import type {
  IAggregateSessionDefinition,
  IAggregateSessionSnapshot,
  ISessionId,
} from '../../types.ts';

/** Replace authoritative definition resources and replay surviving optimism in one transaction. */
export const applyAggregateSessionSnapshotTx = makeTx(
  'applyAggregateSessionSnapshotTx',
)(function* (
  tx: ITx,
  props: {
    snapshot: IAggregateSessionSnapshot;
    sessionId: ISessionId;
    models: IAnyModels;
    definition: IAggregateSessionDefinition;
  },
) {
  const { snapshot, sessionId, models, definition } = props;

  yield* Effect.sync(() => {
    tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
  });
  tx.delete(sessionRepoDbConfig.schema.optimisticAppliedMutations).run();
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
