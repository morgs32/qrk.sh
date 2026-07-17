declare function mapValues<T extends Record<string, unknown>, U>(
  obj: T,
  fn: (value: T[keyof T], key: keyof T & string) => U,
): Record<keyof T & string, U>;

declare function descriptorToDrizzleColumn(props: {
  key: string;
  descriptor: unknown;
}): unknown;

declare function sqliteTable(name: string, columns: unknown): unknown;

type InferDrizzleColumnBuildersFromShape<
  SHAPE extends Record<string, unknown>,
> = {
  [K in keyof SHAPE & string]: unknown;
};

/**
 * Build Drizzle columns with `mapValues` + one record cast — not a manual per-key loop.
 *
 * @bad Per-key casts in a `for (const key of Object.keys(shape))` loop.
 * @bad Patching `$inferInsert` on a hand-written schema type when native Drizzle inference suffices.
 */
export const buildDrizzleColumnsFromShape = <
  SHAPE extends Record<string, unknown>,
>(
  shape: SHAPE,
) =>
  mapValues(shape, (descriptor, key) =>
    descriptorToDrizzleColumn({ key, descriptor }),
  ) as InferDrizzleColumnBuildersFromShape<SHAPE>;

export const makeDrizzleSchemaFromTable = <
  SHAPE extends Record<string, unknown>,
>(
  name: string,
  shape: SHAPE,
) => sqliteTable(name, buildDrizzleColumnsFromShape(shape));
