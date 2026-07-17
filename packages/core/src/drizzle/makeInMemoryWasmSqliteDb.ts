import { type Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { makeInMemorySQLite3 } from './makeInMemorySQLite3.ts';
import { makeWaSqliteDrizzle } from './makeWaSqliteDrizzle.ts';
import type { IDbConfig, IWaSqliteDrizzleDb } from './types.ts';

export const makeInMemoryWasmSqliteDb = Effect.fn('makeInMemoryWasmSqliteDb')(
  function* <CONFIG extends IDbConfig>(props: {
    dbConfig: CONFIG;
  }): Effect.fn.Return<IWaSqliteDrizzleDb<CONFIG>, IAnyError, Async> {
    yield* Effect.void;
    const { dbConfig } = props;
    const client = yield* makeAsync(() => makeInMemorySQLite3());
    // TODO: ({ client, dbConfig })
    return makeWaSqliteDrizzle(client, dbConfig);
  },
);
