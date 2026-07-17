/*
 * System-worker annotation:
 * Implements the SystemRepo migrate System Repo operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import { migrateDb } from '@zerospin/core/drizzle/migrateDb';
import type {
  IDb,
  IDbConfig,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import { Effect } from 'effect';

export const migrateSystemRepo = Effect.fn('SystemRepo.migrate')(function* <
  CONFIG extends IDbConfig,
>(props: {
  storage: DurableObjectStorage;
  db: IDb<CONFIG>;
  schema: IDbConfigSchema<CONFIG>;
}) {
  const { storage, db, schema } = props;

  if (storage.kv.get('isMigratedRepoExplorer') === 'true') {
    return;
  }

  yield* migrateDb({ db, schema });
  storage.kv.put('isMigratedRepoExplorer', 'true');
});
