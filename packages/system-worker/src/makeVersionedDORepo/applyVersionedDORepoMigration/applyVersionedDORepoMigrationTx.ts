import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { ZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Context, Effect } from 'effect';

import type { IVersionedDORepoMigration } from '../types.js';

export class Db extends Context.Service<Db, IDb>()(
  'system-worker/src/makeVersionedDORepo/applyVersionedDORepoMigration/applyVersionedDORepoMigration/Db',
) {
  static readonly Tx = Context.Service<
    'system-worker/src/makeVersionedDORepo/applyVersionedDORepoMigration/applyVersionedDORepoMigration/Db.Tx',
    ITx
  >(
    'system-worker/src/makeVersionedDORepo/applyVersionedDORepoMigration/applyVersionedDORepoMigration/Db.Tx',
  );
}

export const APPLIED_MIGRATIONS_TABLE = 'applied_migrations';

/** Apply all migration statements and record their ledger stamp in the same transaction. */
// 1 — makeTx wraps statements + stamp so a failed statement never commits the ledger row
export const applyVersionedDORepoMigrationTx = makeTx(
  'VersionedDORepo.applyVersionedDORepoMigrationTx',
  Db,
)(function* (props: { migration: IVersionedDORepoMigration }) {
  const { migration } = props;

  const tx = yield* Db.Tx;

  // 2 — tx.run(sql.raw) for each statement in migration.sql
  for (const statement of migration.sql) {
    yield* Effect.try({
      try: () => tx.run(sql.raw(statement)),

      // 3 — versioned-do-repo-migration-failed; transaction rolls back, no stamp
      catch: ZerospinError.catch({
        code: 'versioned-do-repo-migration-failed',
        message: `Failed to apply migration ${migration.id} (${migration.name})`,
        preferCauseMessage: false,
      }),
    });
  }

  const appliedAt = Date.now();

  // 4 — INSERT applied_migrations (id, name, appliedAt)
  yield* Effect.try({
    try: () =>
      tx.run(
        sql.raw(
          `INSERT INTO ${APPLIED_MIGRATIONS_TABLE} (id, name, appliedAt) VALUES (${migration.id}, '${migration.name.replaceAll("'", "''")}', ${appliedAt})`,
        ),
      ),

    // 5 — versioned-do-repo-migration-stamp-failed; transaction rolls back
    catch: ZerospinError.catch({
      code: 'versioned-do-repo-migration-stamp-failed',
      message: `Failed to stamp migration ${migration.id} (${migration.name})`,
      preferCauseMessage: false,
    }),
  });
});
