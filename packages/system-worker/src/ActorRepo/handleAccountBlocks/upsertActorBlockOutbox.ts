/*
 * System-worker annotation:
 * Upserts the post-publish ActorRepo actor block outbox row, encoding JSON
 * columns for SQLite storage outside the handleAccountBlocks transaction.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { type IAnyError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';

import type { IActorBlockOutboxRecord } from '../../types.js';
import { actorRepoDrizzleSchemas } from '../ActorRepo.js';

import { encodeActorBlockOutboxColumns } from './encodeActorBlockOutboxColumns.js';

export const upsertActorBlockOutbox = Effect.fn(
  'ActorRepo.upsertActorBlockOutbox',
)(function* (props: {
  record: IActorBlockOutboxRecord;
  db: IDb;
}): Effect.fn.Return<void, IAnyError> {
  const { db, record } = props;
  const columns = yield* encodeActorBlockOutboxColumns({ record });

  db.insert(actorRepoDrizzleSchemas.actorBlockOutbox)
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
