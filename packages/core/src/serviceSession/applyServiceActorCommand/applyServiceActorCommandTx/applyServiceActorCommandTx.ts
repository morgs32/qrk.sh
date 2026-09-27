import { makeZerospinError, type IAnyError } from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import { Effect } from 'effect';

import type { ISessionId } from '../../../aggregateSession/types.ts';
import { makeTx } from '../../../drizzle/make/makeTx.ts';
import type { ITx } from '../../../drizzle/types.ts';
import { upsertHelper } from '../../../drizzle/upsertHelper.ts';
import type {
  IAnyModels,
  IEncodedResourceShape,
} from '../../../models/types.ts';
import { getByKeyOrThrow } from '../../../utils/getByKeyOrThrow.ts';
import { serviceSessionMetadataDrizzleSchema } from '../../serviceSessionRepoTables.ts';
import type { IServiceActorCommand } from '../../types.ts';

/** Apply a contiguous service definition actorDelta and commit its progress atomically. */
export const applyServiceActorCommandTx = makeTx('applyServiceActorCommandTx')(
  function* (
    tx: ITx,
    props: {
      sessionId: ISessionId;
      command: IServiceActorCommand;
      resourceRows: readonly IEncodedResourceShape[];
      models: IAnyModels;
      actorDelta: NonNullable<IServiceActorCommand['actorDelta']>;
    },
  ): Effect.fn.Return<'applied' | 'duplicate', IAnyError> {
    const { sessionId, command, resourceRows, models, actorDelta } = props;

    const metadata = tx
      .select()
      .from(serviceSessionMetadataDrizzleSchema)
      .where(eq(serviceSessionMetadataDrizzleSchema.sessionId, sessionId))
      .get();
    if (metadata === undefined) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'service-session-metadata-missing',
          message:
            'Service session metadata must exist before command delivery',
        }),
      );
    }
    if (command.serviceIndex <= metadata.serviceIndex) {
      return 'duplicate';
    }
    if (command.serviceIndex !== metadata.serviceIndex + 1) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'service-session-command-index-gap',
          message:
            'Service definition command is not the exact next service index',
          extra: {
            currentServiceIndex: metadata.serviceIndex,
            receivedSessionIndex: command.serviceIndex,
          },
        }),
      );
    }
    yield* Effect.sync(() => {
      tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
    });

    for (const resource of resourceRows) {
      const model = yield* getByKeyOrThrow({
        record: models,
        key: resource.modelName,
        recordKind: 'service definition models',
      });
      upsertHelper({
        table: model.drizzleSchema,
        tx,
        values: resource,
      });
    }

    for (const deletedRef of actorDelta.deleted) {
      const model = yield* getByKeyOrThrow({
        record: models,
        key: deletedRef.modelName,
        recordKind: 'service definition models',
      });
      tx.delete(model.drizzleSchema)
        .where(eq(model.drizzleSchema.id, deletedRef.id))
        .run();
    }

    tx.update(serviceSessionMetadataDrizzleSchema)
      .set({
        serviceIndex: command.serviceIndex,
        serviceHash: command.serviceHash,
      })
      .where(eq(serviceSessionMetadataDrizzleSchema.sessionId, sessionId))
      .run();

    return 'applied';
  },
);
