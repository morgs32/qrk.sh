import type { IDb, IDbConfig } from '@zerospin/core/drizzle/types';
import { type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { IVersionedDORepoMigration } from '../types.js';

import {
  applyVersionedDORepoMigrationTx,
  Db,
} from './applyVersionedDORepoMigrationTx.js';

/*
 * Per-migration apply+stamp unit for VersionedDORepo schema init.
 * `initializeSchema` ensures the ledger, then yields this for each unstamped
 * migration in id order. Fixed-schema siblings (`makeFixedDORepo`) provision
 * once and never replay. Failed SQL aborts the transaction before the ledger
 * insert, so a later activation retries the same id.
 *
 * 1. Open a transaction so SQL and the ledger stamp commit or roll back together.
 * 2. Run each statement in migration.sql in order.
 * 3. On statement failure, fail with versioned-do-repo-migration-failed.
 * 4. INSERT the applied_migrations row (id, escaped name, appliedAt).
 * 5. On stamp failure, fail with versioned-do-repo-migration-stamp-failed.
 */
export const applyVersionedDORepoMigration = Effect.fn(
  'VersionedDORepo.applyMigration',
)(function* <CONFIG extends IDbConfig>(props: {
  db: IDb<CONFIG>;
  migration: IVersionedDORepoMigration;
}): Effect.fn.Return<void, IAnyError> {
  const { db, migration } = props;

  yield* applyVersionedDORepoMigrationTx({ migration }).pipe(
    Effect.provideService(Db, db),
  );
});
