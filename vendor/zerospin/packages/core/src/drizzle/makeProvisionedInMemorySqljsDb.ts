import { type Async } from '@zerospin/core/async/Async';
import { type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { makeInMemorySqljsDb } from './makeInMemorySqljsDb.ts';
import { provisionDb } from './provisionDb.ts';
import type { IDb, IDbConfig } from './types.ts';

/** Builds an in-memory Drizzle db and runs `provisionDb` once. Each call uses a new empty DB. */
export const makeProvisionedInMemorySqljsDb = Effect.fn(
  'makeProvisionedInMemorySqljsDb',
)(function* <CONFIG extends IDbConfig>(props: {
  dbConfig: CONFIG;
}): Effect.fn.Return<IDb<CONFIG>, IAnyError, Async> {
  const { dbConfig } = props;
  const db = yield* makeInMemorySqljsDb({ dbConfig });
  yield* provisionDb({ db, schema: dbConfig.schema });
  return db;
});
