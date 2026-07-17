import { type Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { type IAnyError } from '@zerospin/error';
import { drizzle } from 'drizzle-orm/sql-js';
import { Effect } from 'effect';

import { makeInMemorySqlJsDatabase } from './makeInMemorySqlJsDatabase.ts';
import type { IDb, IDbConfig } from './types.ts';

export const makeInMemorySqljsDb = Effect.fn('makeInMemorySqljsDb')(function* <
  CONFIG extends IDbConfig,
>(props: {
  dbConfig: CONFIG;
}): Effect.fn.Return<IDb<CONFIG>, IAnyError, Async> {
  yield* Effect.void;
  const { dbConfig } = props;
  const client = yield* makeAsync(() => makeInMemorySqlJsDatabase());
  return drizzle(client, {
    relations: dbConfig.relations,
    schema: dbConfig.schema,
    // TODO: Remove this and scan for others
  });
});
