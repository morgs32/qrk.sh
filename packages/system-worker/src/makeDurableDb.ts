/*
 * System-worker annotation:
 * Implements the makeDurableDb.ts make Durable Db operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import type { IDb, IDbConfig } from '@zerospin/core/drizzle/types';
import { drizzle } from 'drizzle-orm/durable-sqlite';

export function makeDurableDb<CONFIG extends IDbConfig>(props: {
  storage: DurableObjectStorage;
  dbConfig: CONFIG;
}): IDb<CONFIG> {
  const { dbConfig, storage } = props;
  storage.sql.exec('PRAGMA foreign_keys = ON;');

  return drizzle(storage, {
    schema: dbConfig.schema,
    relations: dbConfig.relations,
  }) as unknown as IDb<CONFIG>;
}
