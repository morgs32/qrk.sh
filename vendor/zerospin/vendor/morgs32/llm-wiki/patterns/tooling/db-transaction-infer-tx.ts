declare const db: {
  transaction<T>(fn: (tx: unknown) => T): T;
};

declare const someTable: unknown;

/**
 * Let TypeScript infer the transaction client — do not re-derive `tx` with conditional types.
 *
 * @bad `db.transaction((tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => …)`.
 */
export const runInTransaction = () => {
  db.transaction(tx => {
    (tx as { insert(t: unknown): { values(row: unknown): { run(): void } } })
      .insert(someTable)
      .values({ id: 'row_1' })
      .run();
  });
};
