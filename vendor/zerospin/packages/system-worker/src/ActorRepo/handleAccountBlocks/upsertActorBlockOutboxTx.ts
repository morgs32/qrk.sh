/*
 * System-worker annotation:
 * Upserts the pre-publish ActorRepo actor block outbox row through the open
 * handleAccountBlocks transaction.
 */

import type { ITx } from '@zerospin/core/drizzle/types';
import { type IAnyError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';

import type { IActorBlockOutboxRecord } from '../../types.js';
import { actorRepoDrizzleSchemas } from '../ActorRepo.js';

import { encodeActorBlockOutboxColumns } from './encodeActorBlockOutboxColumns.js';

export const upsertActorBlockOutboxTx = Effect.fn(
  'ActorRepo.upsertActorBlockOutboxTx',
)(function* (props: {
  record: IActorBlockOutboxRecord;
  tx: ITx;
}): Effect.fn.Return<void, IAnyError> {
  const { record, tx } = props;
  const columns = yield* encodeActorBlockOutboxColumns({ record });

  tx.insert(actorRepoDrizzleSchemas.actorBlockOutbox)
    .values({
      pushedBlockId: record.pushedBlockId,
      lastAccountCursor: record.lastAccountCursor,
      accountIndex: record.accountIndex,
      ...columns,
    })
    .onConflictDoUpdate({
      target: actorRepoDrizzleSchemas.actorBlockOutbox.lastAccountCursor,
      set: {
        pushedBlockId: sql`excluded.pushedBlockId`,
        accountIndex: sql`excluded.accountIndex`,
        executedCommands: sql`excluded.executedCommands`,
        failedCommands: sql`excluded.failedCommands`,
        appliedMutations: sql`excluded.appliedMutations`,
        deltas: sql`excluded.deltas`,
        failure: sql`excluded.failure`,
      },
    })
    .run();
});
