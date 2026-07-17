declare function checkSqlQuery(sql: string, params: unknown[]): void;

/**
 * Do not cast when types already align — fix the API or types instead of papering over with `as`.
 *
 * @bad `checkSqlQuery(sql, params as unknown[])` when `params` is already `unknown[]`.
 * @bad `return externalApi.fetch() as Promise<MyDto>` without confirming the contract.
 */
export const runQueryCheck = (relational: {
  toSQL(): { sql: string; params: unknown[] };
}) => {
  const { sql, params } = relational.toSQL();
  checkSqlQuery(sql, params);
};
