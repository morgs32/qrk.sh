import { type Async } from '@zerospin/core/async/Async';
import { type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { makeInMemoryWasmSqliteDb } from './makeInMemoryWasmSqliteDb.ts';
import { provisionDb } from './provisionDb.ts';
import type { IDbConfig, IWaSqliteDrizzleDb } from './types.ts';

/** Builds an in-memory Drizzle db and runs `provisionDb` once. Each call uses a new empty DB. */
export const makeProvisionedInMemoryWasmSqliteDb = Effect.fn(
  'makeProvisionedInMemoryWasmSqliteDb',
)(function* <CONFIG extends IDbConfig>(props: {
  dbConfig: CONFIG;
}): Effect.fn.Return<IWaSqliteDrizzleDb<CONFIG>, IAnyError, Async> {
  const { dbConfig } = props;
  const db = yield* makeInMemoryWasmSqliteDb({ dbConfig });
  yield* provisionDb({ db, schema: dbConfig.schema });
  return db;
});
