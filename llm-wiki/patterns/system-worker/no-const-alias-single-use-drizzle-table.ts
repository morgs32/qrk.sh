/**
 * Do not alias a Drizzle table binding used in only one select chain.
 *
 * @bad Assign `const commands = aggregateCommandChainDrizzleSchemas.commands` for a single query.
 */
export function loadRecentAggregateCommands(props: {
  db: {
    select: () => {
      from: (table: unknown) => {
        where: (clause: unknown) => { all: () => unknown[] };
      };
    };
  };
  aggregateCommandChainDrizzleSchemas: { commands: unknown };
  afterAggregateIndex: number;
}) {
  const { afterAggregateIndex, aggregateCommandChainDrizzleSchemas, db } =
    props;

  return db
    .select()
    .from(aggregateCommandChainDrizzleSchemas.commands)
    .where(gtAggregateIndex(afterAggregateIndex))
    .all();
}

declare function gtAggregateIndex(afterAggregateIndex: number): unknown;
