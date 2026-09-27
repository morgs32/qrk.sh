import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import type {
  IDb,
  IDbConfig,
  IDbConfigRelations,
} from '@zerospin/core/drizzle/types';
import { drizzle } from 'drizzle-orm/sql-js';
import { Effect } from 'effect';
import initSqlJs from 'sql.js/dist/sql-wasm-browser.js';
import wasm from 'sql.js/dist/sql-wasm.wasm';

/** Acquire before entering a synchronous transaction; scope owns the scratch connection. */
export const makeActorSnapshotDb = Effect.fn(
  'AggregateActorVersionRepo.makeActorSnapshotDb',
)(function* <CONFIG extends IDbConfig>(config: CONFIG) {
  const SQL = yield* makeAsync(() =>
    initSqlJs({
      instantiateWasm(imports, receiveInstance) {
        const instance = new WebAssembly.Instance(wasm, imports);
        receiveInstance(instance);
        return instance.exports;
      },
    }),
  );
  const client = yield* Effect.acquireRelease(
    Effect.sync(() => new SQL.Database()),
    client => Effect.sync(() => client.close()),
  );
  // A partial graph can refer to unselected rows. User queries see those rows as absent.
  client.exec('PRAGMA foreign_keys = OFF');
  const db: IDb<CONFIG> = drizzle<IDbConfigRelations<CONFIG>>(client, {
    relations: config.relations,
  });
  yield* provisionDb({ db, schema: config.schema });
  return { db, queryDb: { query: db.query } };
});
