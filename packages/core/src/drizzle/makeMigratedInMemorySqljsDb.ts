import { type Async } from '@zerospin/core/async/Async';
import { type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { makeInMemorySqljsDb } from './makeInMemorySqljsDb.ts';
import { migrateDb } from './migrateDb.ts';
import type { IDb, IDbConfig } from './types.ts';

/** Builds an in-memory Drizzle db and runs `migrateDb` once. Each call uses a new empty DB. */
export const makeMigratedInMemorySqljsDb = Effect.fn(
  'makeMigratedInMemorySqljsDb',
)(function* <CONFIG extends IDbConfig>(props: {
  dbConfig: CONFIG;
}): Effect.fn.Return<IDb<CONFIG>, IAnyError, Async> {
  const db = yield* makeInMemorySqljsDb(props);
  yield* migrateDb({ db, schema: props.dbConfig.schema });
  return db;
});
