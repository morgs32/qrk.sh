/**
 * Write `*DbConfig.schema.<table>` at the query site. Do not bind a local to a
 * `*DbConfig` property.
 *
 * @bad Assign `const aggregateChainDrizzleSchemas = aggregateChainDbConfig.schema`.
 * @bad Assign `const admittedCommands = aggregateChainDbConfig.schema.admittedCommands` for a single query.
 * @bad Destructure `const { schema } = dbConfig` or `const schema = dbConfig.schema`.
 */
export function loadRecentAggregateCommands(props: {
  db: {
    select: () => {
      from: (table: unknown) => {
        where: (clause: unknown) => { all: () => unknown[] };
      };
    };
  };
  aggregateChainDbConfig: { schema: { admittedCommands: unknown } };
  afterAggregateIndex: number;
}) {
  const { afterAggregateIndex, aggregateChainDbConfig, db } = props;

  return db
    .select()
    .from(aggregateChainDbConfig.schema.admittedCommands)
    .where(gtAggregateIndex(afterAggregateIndex))
    .all();
}

declare function gtAggregateIndex(afterAggregateIndex: number): unknown;
