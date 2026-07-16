/**
 * Generic type parameters use screaming snake case (`ROW`, `PAGE_CURSOR`, `DB`).
 *
 * @bad PascalCase generics such as `<Row, PageCursor, Db>`.
 * @bad Single-letter generics except where a library convention owns the name.
 */
export const makeStream = <ROW, PAGE_CURSOR, DB>(props: {
  db: DB;
  readBatch: (props: {
    db: DB;
    afterPageCursor: PAGE_CURSOR | null;
  }) => readonly ROW[];
  getPageCursor: (row: ROW) => PAGE_CURSOR | null | undefined;
}): ReadableStream<readonly ROW[]> => {
  const { db, readBatch, getPageCursor } = props;
  return new ReadableStream({
    start(controller) {
      const rows = readBatch({ db, afterPageCursor: null });
      for (const row of rows) {
        controller.enqueue([row]);
        void getPageCursor(row);
      }
      controller.close();
    },
  });
};
