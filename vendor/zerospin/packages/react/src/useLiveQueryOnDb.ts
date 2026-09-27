import { useEffect, useMemo, useRef } from 'react';

import type {
  ILiveRelationalQuery,
  IWaSqliteClient,
} from '@zerospin/core/drizzle/types';
import { makeLiveQuery } from '@zerospin/live-query/makeLiveQuery';
import { useStore } from 'zustand/react';

function stableTableNamesEquals(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

/*
 * 1. Keep the latest caller callbacks without rebuilding for identity-only changes.
 * 2. Build the Drizzle query when the database, key value, or watched tables change.
 * 3. Create one vanilla live-query store for that built query.
 * 4. Subscribe during the React effect lifecycle and release on replacement/unmount.
 * 5. Return the selected vanilla store state to the React consumer.
 */
export function useLiveQueryOnDb<
  DB extends { $client: IWaSqliteClient },
  KEY,
  QUERY extends ILiveRelationalQuery,
>(props: {
  query: (db: DB, key: KEY) => QUERY;
  db: DB;
  key: KEY;
  tableNames: readonly string[];
}): {
  data: QUERY['_']['result'];
  error: Error | undefined;
  updatedAt: Date | undefined;
};
export function useLiveQueryOnDb<
  DB extends { $client: IWaSqliteClient },
  QUERY extends ILiveRelationalQuery,
>(props: {
  query: (db: DB) => QUERY;
  db: DB;
  key?: undefined;
  tableNames: readonly string[];
}): {
  data: QUERY['_']['result'];
  error: Error | undefined;
  updatedAt: Date | undefined;
};
export function useLiveQueryOnDb<
  DB extends { $client: IWaSqliteClient },
  QUERY extends ILiveRelationalQuery,
>(props: {
  query: (db: DB, key?: unknown) => QUERY;
  db: DB;
  key?: unknown;
  tableNames: readonly string[];
}): {
  data: QUERY['_']['result'];
  error: Error | undefined;
  updatedAt: Date | undefined;
} {
  const { db, query, key, tableNames } = props;

  // 1 — callback claims alone does not rebuild the query.
  const tableNamesRef = useRef(tableNames);
  const queryRef = useRef(query);
  queryRef.current = query;

  const stableTableNames = useMemo(() => {
    if (stableTableNamesEquals(tableNamesRef.current, tableNames)) {
      return tableNamesRef.current;
    }
    tableNamesRef.current = tableNames;
    return tableNames;
  }, [tableNames]);

  // 2 — key value and watched tables are the caller-controlled invalidation contract.
  const builtQuery = useMemo<QUERY>(() => {
    if (key === undefined) {
      return queryRef.current(db);
    }
    return queryRef.current(db, key);
  }, [db, key]);

  // 3 — a dependency change replaces the complete vanilla query lifecycle.
  const liveQuery = useMemo(
    () =>
      makeLiveQuery({
        client: db.$client,
        query: builtQuery,
        tableNames: stableTableNames,
      }),
    [builtQuery, db, stableTableNames],
  );

  // 4 — no SQLite listener is installed during React render or abandoned renders.
  useEffect(() => liveQuery.subscribe(), [liveQuery]);

  // 5 — Zustand owns the React subscription to data/error/timestamp changes.
  return useStore(liveQuery.store);
}
