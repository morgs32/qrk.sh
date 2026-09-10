import { ZerospinError, type IAnyError } from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import { Context, Effect } from 'effect';

import type { IEncodedCommand } from '../contracts/types.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type { IDb, ITx } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';
import type { IAnyModels, IEncodedResourceShape } from '../models/types.ts';
import type { ISessionId } from '../session/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { serviceSessionMetadataDrizzleSchema } from './serviceSessionRepoTables.ts';
import type { IServiceFrontendFinalizedCommand } from './types.ts';

export class Db extends Context.Service<Db, IDb>()(
  'core/src/serviceSession/applyServiceFrontendCommand/Db',
) {
  static readonly Tx = Context.Service<
    'core/src/serviceSession/applyServiceFrontendCommand/Db.Tx',
    ITx
  >('core/src/serviceSession/applyServiceFrontendCommand/Db.Tx');
}

/** Apply a contiguous service frontend delta and commit its progress atomically. */
export const applyServiceFrontendCommandTx = makeTx(
  'applyServiceFrontendCommandTx',
  Db,
)(function* (props: {
  sessionId: ISessionId;
  command: IEncodedCommand<IServiceFrontendFinalizedCommand>;
  resourceRows: readonly IEncodedResourceShape[];
  models: IAnyModels;
  delta: NonNullable<IServiceFrontendFinalizedCommand['delta']>;
}): Effect.fn.Return<
  'applied' | 'duplicate',
  IAnyError,
  typeof Db.Tx.Identifier
> {
  const { sessionId, command, resourceRows, models, delta } = props;

  const tx = yield* Db.Tx;
  const metadata = tx
    .select()
    .from(serviceSessionMetadataDrizzleSchema)
    .where(eq(serviceSessionMetadataDrizzleSchema.sessionId, sessionId))
    .get();
  if (metadata === undefined) {
    return yield* new ZerospinError({
      code: 'service-session-metadata-missing',
      message: 'Service session metadata must exist before command delivery',
    });
  }
  if (command.serviceVersion !== metadata.serviceVersion) {
    return yield* new ZerospinError({
      code: 'service-frontend-version-mismatch',
      message: 'Service output belongs to another session version',
    });
  }
  if (command.serviceIndex <= metadata.serviceIndex) {
    return 'duplicate';
  }
  if (command.serviceIndex !== metadata.serviceIndex + 1) {
    return yield* new ZerospinError({
      code: 'service-frontend-command-index-gap',
      message: 'Service frontend command is not the exact next service index',
      extra: {
        currentServiceIndex: metadata.serviceIndex,
        receivedFrontendIndex: command.serviceIndex,
      },
    });
  }
  yield* Effect.sync(() => {
    tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
  });

  for (const resource of resourceRows) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: resource.modelName,
      recordKind: 'service frontend models',
    });
    upsertHelper({
      table: model.drizzleSchema,
      tx,
      values: resource,
    });
  }

  for (const deletedRef of delta.deleted) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: deletedRef.modelName,
      recordKind: 'service frontend models',
    });
    tx.delete(model.drizzleSchema)
      .where(eq(model.drizzleSchema.id, deletedRef.id))
      .run();
  }

  tx.update(serviceSessionMetadataDrizzleSchema)
    .set({
      serviceIndex: command.serviceIndex,
    })
    .where(eq(serviceSessionMetadataDrizzleSchema.sessionId, sessionId))
    .run();

  return 'applied';
});
