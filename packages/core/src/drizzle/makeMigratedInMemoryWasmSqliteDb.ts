import { type Async } from '@zerospin/core/async/Async';
import { type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { makeInMemoryWasmSqliteDb } from './makeInMemoryWasmSqliteDb.ts';
import { migrateDb } from './migrateDb.ts';
import type { IDbConfig, IWaSqliteDrizzleDb } from './types.ts';

/** Builds an in-memory Drizzle db and runs `migrateDb` once. Each call uses a new empty DB. */
export const makeMigratedInMemoryWasmSqliteDb = Effect.fn(
  'makeMigratedInMemoryWasmSqliteDb',
)(function* <CONFIG extends IDbConfig>(props: {
  dbConfig: CONFIG;
}): Effect.fn.Return<IWaSqliteDrizzleDb<CONFIG>, IAnyError, Async> {
  const db = yield* makeInMemoryWasmSqliteDb(props);
  // TODO: Destructure props and scan for others. Update llm-wiki
  yield* migrateDb({ db, schema: props.dbConfig.schema });
  return db;
});
