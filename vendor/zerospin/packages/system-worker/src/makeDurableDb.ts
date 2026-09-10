/*
 * System-worker annotation:
 * Implements the makeDurableDb.ts make Durable Db operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import type { IDb, IDbConfig } from '@zerospin/core/drizzle/types';
import { drizzle } from 'drizzle-orm/durable-sqlite';

/*
 * Bind Drizzle without accessing storage. The common Repo activation gate
 * enables foreign keys and provisions the schema after spec acceptance.
 */
export function makeDurableDb<CONFIG extends IDbConfig>(props: {
  storage: DurableObjectStorage;
  dbConfig: CONFIG;
}): IDb<CONFIG> {
  const { dbConfig, storage } = props;

  // Pass the configured relations to the durable-sqlite driver without SQL.
  return drizzle(storage, {
    relations: dbConfig.relations,
  }) as unknown as IDb<CONFIG>;
}
