declare function mapValues<T extends Record<string, unknown>, U>(
  record: T,
  fn: (value: T[keyof T], key: string) => U,
): Record<string, U>;
declare function makeDrizzleSchema(key: string, shape: unknown): unknown;

/**
 * Split different input shapes into explicitly named helpers.
 *
 * @bad Overloads with a parameter named `shapesOrTables` hiding the branch.
 */
export function makeDrizzleSchemaRecord<SHAPES extends Record<string, unknown>>(
  shapes: SHAPES,
) {
  return mapValues(shapes, (shape, key) => makeDrizzleSchema(key, shape));
}

export function makeDrizzleSchemasRecordFromTables<
  TABLES extends Record<string, unknown>,
>(tables: TABLES) {
  return mapValues(tables, (table, key) => makeDrizzleSchema(key, table));
}
