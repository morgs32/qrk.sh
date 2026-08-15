/**
 * Do not alias a Drizzle table binding used in only one select chain.
 *
 * @bad Assign `const executedCommands = schema.finalizedAggregateCommands` for a single query.
 */
export function loadRecentExecutedCommands(props: {
  db: {
    select: () => {
      from: (table: unknown) => {
        where: (clause: unknown) => { all: () => unknown[] };
      };
    };
  };
  aggregateRepoDrizzleSchemas: { finalizedAggregateCommands: unknown };
  aggregateName: string;
}) {
  const { aggregateName, aggregateRepoDrizzleSchemas, db } = props;

  return db
    .select()
    .from(aggregateRepoDrizzleSchemas.finalizedAggregateCommands)
    .where(eqAggregateName(aggregateName))
    .all();
}

declare function eqAggregateName(aggregateName: string): unknown;
