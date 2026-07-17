/**
 * Do not alias a Drizzle table binding used in only one select chain.
 *
 * @bad Assign `const executedCommands = schema.finalizedAccountCommands` for a single query.
 */
export function loadRecentExecutedCommands(props: {
  db: {
    select: () => {
      from: (table: unknown) => {
        where: (clause: unknown) => { all: () => unknown[] };
      };
    };
  };
  accountRepoDrizzleSchemas: { finalizedAccountCommands: unknown };
  accountName: string;
}) {
  const { db, accountRepoDrizzleSchemas, accountName } = props;

  return db
    .select()
    .from(accountRepoDrizzleSchemas.finalizedAccountCommands)
    .where(eqAccountName(accountName))
    .all();
}

declare function eqAccountName(accountName: string): unknown;
