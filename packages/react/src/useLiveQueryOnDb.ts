import { useEffect, useMemo, useRef } from "react";

import type {
  ILiveRelationalQuery,
  IWaSqliteClient,
} from "@zerospin/core/drizzle/types";
import { makeLiveQuery } from "@zerospin/live-query/makeLiveQuery";
import { useStore } from "zustand/react";

/*
 * 1. Keep the latest caller callbacks without rebuilding for identity-only changes.
 * 2. Build the Drizzle query only when the database or explicit dependencies change.
 * 3. Create one vanilla live-query store for that built query.
 * 4. Subscribe during the React effect lifecycle and release on replacement/unmount.
 * 5. Return the selected vanilla store state to the React consumer.
 */
export function useLiveQueryOnDb<
  DB extends { $client: IWaSqliteClient },
  QUERY extends ILiveRelationalQuery,
>(props: {
  query: (db: DB) => QUERY;
  db: DB;
  deps: readonly unknown[];
  tableNames: readonly string[];
}): {
  data: QUERY["_"]["result"];
  error: Error | undefined;
  updatedAt: Date | undefined;
} {
  const { db, query, deps, tableNames } = props;

  // 1 — callback identity alone does not rebuild the query.
  const tableNamesRef = useRef(tableNames);
  const queryRef = useRef(query);
  tableNamesRef.current = tableNames;
  queryRef.current = query;

  // 2 — explicit deps remain the caller-controlled invalidation contract.
  // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps
  const builtQuery = useMemo<QUERY>(() => queryRef.current(db), [db, ...deps]);

  // 3 — a dependency change replaces the complete vanilla query lifecycle.
  const liveQuery = useMemo(
    () =>
      makeLiveQuery({
        client: db.$client,
        query: builtQuery,
        tableNames: tableNamesRef.current,
      }),
    [builtQuery, db],
  );

  // 4 — no SQLite listener is installed during React render or abandoned renders.
  useEffect(() => liveQuery.subscribe(), [liveQuery]);

  // 5 — Zustand owns the React subscription to data/error/timestamp changes.
  return useStore(liveQuery.store);
}
