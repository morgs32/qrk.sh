/**
 * Read-only Drizzle queries use `db` directly — reserve `makeTx` for atomic writes.
 *
 * @bad Wrap cursor watermark reads in `makeTx` when no writes share the transaction.
 * @bad Paginate read chunks inside `managedRuntime.runPromise(makeTx(...))`.
 */
export function pollForFrontend(props: {
  db: {
    select: () => {
      from: (table: unknown) => {
        where: (clause: unknown) => {
          orderBy: (order: unknown) => {
            limit: (n: number) => { all: () => unknown[] };
          };
        };
      };
    };
  };
  pushedCommandsTable: unknown;
  afterCursor: string | null;
}) {
  const { db, pushedCommandsTable, afterCursor } = props;

  const rows = db
    .select()
    .from(pushedCommandsTable)
    .where(gtPushedCursor(afterCursor))
    .orderBy(ascPushedCursor())
    .limit(ACTOR_REPO_FANOUT_BATCH_LIMIT)
    .all();

  return { pushedCommands: rows };
}

declare const ACTOR_REPO_FANOUT_BATCH_LIMIT: number;
declare function gtPushedCursor(after: string | null): unknown;
declare function ascPushedCursor(): unknown;
