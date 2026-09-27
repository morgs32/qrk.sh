import { sql } from 'drizzle-orm';
import { Effect } from 'effect';

import type { ISessionId } from '../../../aggregateSession/types.ts';
import { makeTx } from '../../../drizzle/make/makeTx.ts';
import type { ITx } from '../../../drizzle/types.ts';
import type { IAnyModels } from '../../../models/types.ts';
import { getByKeyOrThrow } from '../../../utils/getByKeyOrThrow.ts';
import { serviceSessionMetadataDrizzleSchema } from '../../serviceSessionRepoTables.ts';
import type { IServiceSessionSnapshot } from '../../types.ts';

/** Replace service definition resources and commit the snapshot progress together. */
export const applyServiceSessionSnapshotTx = makeTx(
  'applyServiceSessionSnapshotTx',
)(function* (
  tx: ITx,
  props: {
    models: IAnyModels;
    snapshot: IServiceSessionSnapshot;
    sessionId: ISessionId;
  },
) {
  const { models, snapshot, sessionId } = props;

  yield* Effect.sync(() => {
    tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
  });

  for (const model of Object.values(models)) {
    tx.delete(model.drizzleSchema).run();
  }

  for (const resource of snapshot.resources) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: resource.modelName,
      recordKind: 'service definition models',
    });
    tx.insert(model.drizzleSchema).values(resource).run();
  }

  tx.insert(serviceSessionMetadataDrizzleSchema)
    .values({
      sessionId,
      serviceIndex: snapshot.serviceIndex,
      serviceHash: snapshot.serviceHash,
      serviceVersion: snapshot.serviceVersion,
    })
    .onConflictDoUpdate({
      target: serviceSessionMetadataDrizzleSchema.sessionId,
      set: {
        serviceIndex: snapshot.serviceIndex,
        serviceHash: snapshot.serviceHash,
        serviceVersion: snapshot.serviceVersion,
      },
    })
    .run();
});
