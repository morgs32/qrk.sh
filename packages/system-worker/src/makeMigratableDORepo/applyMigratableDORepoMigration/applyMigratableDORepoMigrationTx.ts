import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { catchZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';

import type { IMigratableDORepoMigration } from '../types.js';

export const APPLIED_MIGRATIONS_TABLE = 'applied_migrations';

/** Apply all migration statements and record their ledger stamp in the same transaction. */
// 1 — makeTx wraps statements + stamp so a failed statement never commits the ledger row
export const applyMigratableDORepoMigrationTx = makeTx(
  'MigratableDORepo.applyMigratableDORepoMigrationTx',
)(function* (tx: ITx, props: { migration: IMigratableDORepoMigration }) {
  const { migration } = props;

  // 2 — tx.run(sql.raw) for each statement in migration.sql
  for (const statement of migration.sql) {
    yield* Effect.try({
      try: () => tx.run(sql.raw(statement)),

      // 3 — migratable-do-repo-migration-failed; transaction rolls back, no stamp
      catch: catchZerospinError({
        code: 'migratable-do-repo-migration-failed',
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

    // 5 — migratable-do-repo-migration-stamp-failed; transaction rolls back
    catch: catchZerospinError({
      code: 'migratable-do-repo-migration-stamp-failed',
      message: `Failed to stamp migration ${migration.id} (${migration.name})`,
      preferCauseMessage: false,
    }),
  });
});
