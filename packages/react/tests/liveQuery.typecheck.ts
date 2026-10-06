import type { IWaSqliteClient } from '@zerospin/core/drizzle/types';
import { useLiveQueryOnDb } from '@zerospin/react/useLiveQueryOnDb';
import { assert, type Equals } from 'tsafe';

/** Captured selections retain their row type through the synchronous adapter. */
export function useSelectionRows(db: { $client: IWaSqliteClient }) {
  const result = useLiveQueryOnDb({
    db,
    key: 'item',
    tableNames: ['item', 'purchase'],
    query: (_db, selectionName) => {
      const rows: { id: string; amount: number }[] = [];
      return {
        _: { result: rows },
        all: () => rows.map(row => ({ ...row, id: selectionName + row.id })),
      };
    },
  });
  assert<Equals<typeof result.data, { id: string; amount: number }[]>>();
  return result;
}

export function useUnkeyedSelectionRows(db: { $client: IWaSqliteClient }) {
  const rows: { id: string }[] = [];
  const result = useLiveQueryOnDb({
    db,
    tableNames: ['item'],
    query: () => ({ _: { result: rows }, all: () => rows }),
  });
  assert<Equals<typeof result.data, { id: string }[]>>();
  return result;
}
