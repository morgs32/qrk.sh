/**
 * Read-only Drizzle queries use `db` directly — reserve `makeTx` for atomic writes.
 *
 * @bad Wrap command-frontier reads in `makeTx` when no writes share the transaction.
 * @bad Paginate command pages inside `managedRuntime.runPromise(makeTx(...))`.
 */
export function readAggregateCommands(props: {
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
  commandsTable: unknown;
  afterAggregateIndex: number;
}) {
  const { afterAggregateIndex, commandsTable, db } = props;

  const rows = db
    .select()
    .from(commandsTable)
    .where(gtAggregateIndex(afterAggregateIndex))
    .orderBy(ascAggregateIndex())
    .limit(COMMAND_PAGE_LIMIT)
    .all();

  return { commands: rows };
}

declare const COMMAND_PAGE_LIMIT: number;
declare function gtAggregateIndex(afterAggregateIndex: number): unknown;
declare function ascAggregateIndex(): unknown;
