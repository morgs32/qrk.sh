import { sql } from 'drizzle-orm';
import { Context, Effect } from 'effect';

import { makeTx } from '../drizzle/makeTx.ts';
import type { IDb, ITx } from '../drizzle/types.ts';
import type { IAnyModels } from '../models/types.ts';
import type { ISessionId } from '../session/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { serviceSessionMetadataDrizzleSchema } from './serviceSessionRepoTables.ts';
import type { IServiceFrontendState } from './types.ts';

export class Db extends Context.Service<Db, IDb>()(
  'core/src/serviceSession/applyServiceFrontendState/Db',
) {
  static readonly Tx = Context.Service<
    'core/src/serviceSession/applyServiceFrontendState/Db.Tx',
    ITx
  >('core/src/serviceSession/applyServiceFrontendState/Db.Tx');
}

/** Replace service frontend resources and commit the snapshot progress together. */
export const applyServiceFrontendStateTx = makeTx(
  'applyServiceFrontendStateTx',
  Db,
)(function* (props: {
  models: IAnyModels;
  frontendState: IServiceFrontendState;
  sessionId: ISessionId;
}) {
  const { models, frontendState, sessionId } = props;

  const tx = yield* Db.Tx;
  yield* Effect.sync(() => {
    tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
  });

  for (const model of Object.values(models)) {
    tx.delete(model.drizzleSchema).run();
  }

  for (const resource of frontendState.resources) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: resource.modelName,
      recordKind: 'service frontend models',
    });
    tx.insert(model.drizzleSchema).values(resource).run();
  }

  tx.insert(serviceSessionMetadataDrizzleSchema)
    .values({
      sessionId,
      serviceIndex: frontendState.serviceIndex,
      serviceVersion: frontendState.serviceVersion,
    })
    .onConflictDoUpdate({
      target: serviceSessionMetadataDrizzleSchema.sessionId,
      set: {
        serviceIndex: frontendState.serviceIndex,
        serviceVersion: frontendState.serviceVersion,
      },
    })
    .run();
});
