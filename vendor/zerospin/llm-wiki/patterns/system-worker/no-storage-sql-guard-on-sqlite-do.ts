/**
 * SQLite DO repos listed under `new_sqlite_classes` always have `ctx.storage.sql`.
 *
 * @bad Guard with `invariant(storage.sql, …)` or `if (!storage.sql)` at repo init.
 * @bad Fail with `actor-repo-initialize-failed` when SQL is missing on a SQLite class.
 */
export function initActorRepoDb(props: {
  storage: { sql: unknown };
  schema: Record<string, unknown>;
  relations: Record<string, unknown>;
}) {
  const { storage, schema, relations } = props;

  return makeDurableDb({
    storage,
    schema,
    relations,
  });
}

declare function makeDurableDb(props: {
  storage: { sql: unknown };
  schema: Record<string, unknown>;
  relations: Record<string, unknown>;
}): unknown;
