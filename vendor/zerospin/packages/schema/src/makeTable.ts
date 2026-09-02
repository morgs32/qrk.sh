import { PrimitiveKind } from './primitiveKind.ts';
import type {
  IAnyRefDescriptor,
  IAnyShape,
  IDrizzleIndexConfig,
  IPrimaryKeyDescriptor,
  ITable,
} from './types.ts';

type ISelfRefDescriptor = IAnyRefDescriptor & { self: true };

export function makeTable<
  TABLE_NAME extends string,
  SHAPE extends IAnyShape,
>(props: {
  name: TABLE_NAME;
  shape: SHAPE;
  indexes?: readonly IDrizzleIndexConfig<keyof SHAPE & string>[];
}): ITable<TABLE_NAME, SHAPE> {
  const { name, shape, indexes = [] } = props;
  const table = { name, shape, indexes };

  let primaryKeyColumnName: string | undefined;
  let primaryKeyDescriptor: IPrimaryKeyDescriptor | undefined;
  let hasMultiplePrimaryKeys = false;

  // Step 1: find the table's sole primary key before resolving any self refs.
  for (const [columnName, descriptor] of Object.entries(shape)) {
    if (descriptor.kind !== PrimitiveKind.PrimaryKey) {
      continue;
    }
    if (primaryKeyDescriptor !== undefined) {
      hasMultiplePrimaryKeys = true;
      continue;
    }
    primaryKeyColumnName = columnName;
    primaryKeyDescriptor = descriptor;
  }

  // Step 2: replace each construction-only self marker with a complete ref.
  for (const descriptor of Object.values(shape)) {
    if (
      descriptor.kind !== PrimitiveKind.Ref ||
      !('self' in descriptor) ||
      descriptor.self !== true
    ) {
      continue;
    }

    if (
      primaryKeyColumnName === undefined ||
      primaryKeyDescriptor === undefined
    ) {
      throw new Error(
        `primitives.self table "${name}" must have one primary key`,
      );
    }
    if (hasMultiplePrimaryKeys) {
      throw new Error(
        `primitives.self table "${name}" must have only one primary key`,
      );
    }

    const selfMarker: { self: true } = { self: true };
    const selfDescriptor: ISelfRefDescriptor = Object.assign(
      descriptor,
      selfMarker,
    );
    selfDescriptor.abbreviation = primaryKeyDescriptor.abbreviation;
    selfDescriptor.table = table;
    selfDescriptor.targetTableName = name;
    selfDescriptor.targetColumnName = primaryKeyColumnName;
    Reflect.deleteProperty(selfDescriptor, 'self');
  }

  return table;
}
