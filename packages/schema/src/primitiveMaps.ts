import type { ColumnBuilderBase } from 'drizzle-orm/column-builder';
import {
  integer as drizzleInteger,
  real as drizzleReal,
  text as drizzleText,
  index,
  sqliteTable,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { Effect, Schema } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IEncodedShape } from './encodeShape.ts';
import { makeAbbreviationIdSchema } from './makeAbbreviationIdSchema.ts';
import { PrimitiveKind } from './primitiveKind.ts';
import type {
  IAnyDrizzleSchema,
  IAnyPrimitiveDescriptor,
  IAnyRefDescriptor,
  IAnyShape,
  IDrizzleIndexConfig,
  IDrizzleSchema,
  InferDecodedRow,
  InferDrizzleColumnBuilderFromDescriptor,
  InferDrizzleColumnBuildersFromShape,
  InferEncodedRow,
  InferIdFromAbbreviation,
  IPrimitiveDescriptorDecoded,
  IPrimitiveDescriptorEncoded,
  IShape,
  ITable,
} from './types.ts';

function buildDrizzleColumnsFromShape<SHAPE extends IAnyShape>(
  shape: SHAPE,
  resolveReference?: (descriptor: IAnyRefDescriptor) => () => AnySQLiteColumn,
): InferDrizzleColumnBuildersFromShape<SHAPE> {
  return mapValues(shape, (descriptor, key) =>
    descriptorToDrizzleColumn({
      key: String(key),
      descriptor,
      ...(descriptor.kind === PrimitiveKind.Ref &&
      resolveReference !== undefined
        ? { reference: resolveReference(descriptor) }
        : {}),
    }),
  ) as InferDrizzleColumnBuildersFromShape<SHAPE>;
}

function buildDrizzleColumnsFromEncodedShape(
  shape: IEncodedShape,
): Record<string, ColumnBuilderBase> {
  return mapValues(shape, (descriptor, key) =>
    descriptorToDrizzleColumn({ key: String(key), descriptor }),
  );
}

const primitiveKindValues = new Set<string>(Object.values(PrimitiveKind));

function uniqueConstraintSql(descriptor: IAnyPrimitiveDescriptor): string {
  if (
    descriptor.kind === PrimitiveKind.PrimaryKey ||
    descriptor.kind === PrimitiveKind.Json
  ) {
    return '';
  }
  return descriptor.unique === true ? ' UNIQUE' : '';
}

export function isAttributeDescriptor(
  value: unknown,
): value is IAnyPrimitiveDescriptor {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    return false;
  }
  return primitiveKindValues.has(String(value.kind));
}

/*
 * 1. Resolve whether the descriptor accepts null.
 * 2. Map booleans and non-primary identifier descriptors.
 * 3. Build primary-key decoding.
 * 4. Map scalar, JSON, date, enum, and reference descriptors.
 * 5. Reject descriptor kinds outside the supported primitive set.
 */
export function descriptorToEffectSchema(
  descriptor: IAnyPrimitiveDescriptor,
): Schema.Codec<unknown, unknown> {
  // 1 — Nullable descriptors wrap their concrete codec in Schema.NullOr.
  const nullable = descriptor.nullable === true;
  switch (descriptor.kind) {
    // 2 — Boolean and opaque identifier families map directly to their runtime
    // value schema, preserving the descriptor's abbreviation where applicable.
    case PrimitiveKind.Boolean: {
      return nullable ? Schema.NullOr(Schema.Boolean) : Schema.Boolean;
    }
    case PrimitiveKind.Cursor: {
      const cursorSchema = makeAbbreviationIdSchema(descriptor.abbreviation);
      return nullable ? Schema.NullOr(cursorSchema) : cursorSchema;
    }
    case PrimitiveKind.ForeignKey: {
      const foreignKeySchema = makeAbbreviationIdSchema(
        descriptor.abbreviation,
      );
      return nullable ? Schema.NullOr(foreignKeySchema) : foreignKeySchema;
    }
    // 3 — Primary keys require a caller-supplied prefixed ID.
    case PrimitiveKind.PrimaryKey: {
      return makeAbbreviationIdSchema(descriptor.abbreviation);
    }
    // 4 — Remaining scalar, structured, temporal, enum, and ref descriptors
    // choose their value codec and then apply nullable semantics.
    case PrimitiveKind.Integer: {
      return nullable ? Schema.NullOr(Schema.Number) : Schema.Number;
    }
    case PrimitiveKind.Number: {
      return nullable ? Schema.NullOr(Schema.Number) : Schema.Number;
    }
    case PrimitiveKind.Text: {
      return nullable ? Schema.NullOr(Schema.String) : Schema.String;
    }
    case PrimitiveKind.Json: {
      const jsonSchema = Schema.fromJsonString(descriptor.schema);
      return nullable ? Schema.NullOr(jsonSchema) : jsonSchema;
    }
    case PrimitiveKind.Date: {
      return nullable ? Schema.NullOr(Schema.Date) : Schema.Date;
    }
    case PrimitiveKind.Enum: {
      const literal = Schema.Literals(descriptor.values);
      return nullable ? Schema.NullOr(literal) : literal;
    }
    case PrimitiveKind.Ref: {
      if (descriptor.targetKind === PrimitiveKind.Integer) {
        return nullable ? Schema.NullOr(Schema.Number) : Schema.Number;
      }
      const idSchema = makeAbbreviationIdSchema(descriptor.abbreviation);
      return nullable ? Schema.NullOr(idSchema) : idSchema;
    }
    // 5 — A descriptor that reaches this branch violated the primitive contract.
    default: {
      throw new Error(
        `Invalid attribute descriptor: ${JSON.stringify(descriptor)}`,
      );
    }
  }
}

export function descriptorToJsonEffectSchema(
  descriptor: IAnyPrimitiveDescriptor,
): Schema.Codec<unknown, unknown> {
  switch (descriptor.kind) {
    case PrimitiveKind.Date: {
      return descriptor.nullable === true
        ? Schema.NullOr(Schema.DateFromString)
        : Schema.DateFromString;
    }
    default: {
      return descriptorToEffectSchema(descriptor);
    }
  }
}

export function descriptorToDrizzleColumn<
  D extends IAnyPrimitiveDescriptor,
>(props: {
  key: string;
  descriptor: D;
  reference?: () => AnySQLiteColumn;
}): InferDrizzleColumnBuilderFromDescriptor<D>;
export function descriptorToDrizzleColumn(props: {
  key: string;
  descriptor: IEncodedShape[string];
  reference?: () => AnySQLiteColumn;
}): ColumnBuilderBase;
/*
 * 1. Resolve column name and nullability.
 * 2. Build boolean, integer, and real columns with defaults and uniqueness.
 * 3. Build text and JSON storage columns.
 * 4. Build timestamp and enum columns.
 * 5. Build references with optional foreign-key callbacks.
 * 6. Build opaque identifiers and primary keys.
 * 7. Return the selected Drizzle column builder.
 */
export function descriptorToDrizzleColumn(props: {
  key: string;
  descriptor: IAnyPrimitiveDescriptor | IEncodedShape[string];
  reference?: () => AnySQLiteColumn;
}): ColumnBuilderBase {
  const { reference } = props;
  // 1 — Every branch shares the authored column key and nullable flag.
  const { key, descriptor } = props;
  const nullable = descriptor.nullable === true;
  const column: ColumnBuilderBase = (() => {
    switch (descriptor.kind) {
      // 2 — Numeric-backed primitives preserve defaults, uniqueness, and the
      // integer descriptor's optional physical primary-key role.
      case PrimitiveKind.Boolean: {
        let col = nullable
          ? drizzleInteger(key, { mode: 'boolean' })
          : drizzleInteger(key, { mode: 'boolean' }).notNull();
        if (descriptor.defaultValue !== undefined) {
          col = col.default(descriptor.defaultValue);
        }
        return descriptor.unique === true ? col.unique() : col;
      }
      case PrimitiveKind.Integer: {
        let col = nullable
          ? drizzleInteger(key)
          : drizzleInteger(key).notNull();
        if (descriptor.primaryKey === true) {
          return col.primaryKey();
        }
        if (descriptor.defaultValue !== undefined) {
          col = col.default(descriptor.defaultValue);
        }
        return descriptor.unique === true ? col.unique() : col;
      }
      case PrimitiveKind.Number: {
        let col = nullable ? drizzleReal(key) : drizzleReal(key).notNull();
        if (descriptor.defaultValue !== undefined) {
          col = col.default(descriptor.defaultValue);
        }
        return descriptor.unique === true ? col.unique() : col;
      }
      // 3 — Text applies scalar defaults; JSON deliberately stores encoded
      // strings and only permits the documented nullable-null default.
      case PrimitiveKind.Text: {
        if (nullable) {
          let col = drizzleText(key).$type<string | null>();
          if (descriptor.defaultValue !== undefined) {
            col = col.default(descriptor.defaultValue);
          }
          return descriptor.unique === true ? col.unique() : col;
        }
        let col = drizzleText(key).notNull();
        if (
          descriptor.defaultValue !== undefined &&
          descriptor.defaultValue !== null
        ) {
          col = col.default(descriptor.defaultValue);
        }
        return descriptor.unique === true ? col.unique() : col;
      }
      case PrimitiveKind.Json: {
        // Literal `string` for `$type` (not `Schema.Encoded<parseJson>`) — see INullableJsonTextColumnBuilder.
        if (nullable) {
          let col = drizzleText(key).$type<string | null>();
          if (descriptor.defaultValue === null) {
            col = col.default(null);
          }
          return col;
        }
        return drizzleText(key).$type<string>().notNull();
      }
      // 4 — Dates use millisecond integers while enums retain literal values
      // in typed text columns; both preserve defaults and uniqueness.
      case PrimitiveKind.Date: {
        let col = nullable
          ? drizzleInteger(key, { mode: 'timestamp_ms' })
          : drizzleInteger(key, { mode: 'timestamp_ms' }).notNull();
        if (descriptor.defaultValue !== undefined) {
          col = col.default(
            typeof descriptor.defaultValue === 'string'
              ? new Date(descriptor.defaultValue)
              : descriptor.defaultValue,
          );
        }
        return descriptor.unique === true ? col.unique() : col;
      }
      case PrimitiveKind.Enum: {
        const values = descriptor.values;
        let col = nullable
          ? drizzleText(key, { enum: values })
          : drizzleText(key, { enum: values }).notNull();
        if (descriptor.defaultValue !== undefined) {
          col = col.default(descriptor.defaultValue);
        }
        return descriptor.unique === true ? col.unique() : col;
      }
      // 5 — Refs select integer or prefixed-text storage and attach the lazy
      // foreign-key target only when the caller resolved one.
      case PrimitiveKind.Ref: {
        if (descriptor.targetKind === PrimitiveKind.Integer) {
          let col = nullable
            ? drizzleInteger(key)
            : drizzleInteger(key).notNull();
          if (reference !== undefined) {
            col = col.references(reference);
          }
          return descriptor.unique === true ? col.unique() : col;
        }
        let col = nullable
          ? drizzleText(key).$type<
              InferIdFromAbbreviation<typeof descriptor.abbreviation>
            >()
          : drizzleText(key)
              .$type<InferIdFromAbbreviation<typeof descriptor.abbreviation>>()
              .notNull();
        if (reference !== undefined) {
          col = col.references(reference);
        }
        return descriptor.unique === true ? col.unique() : col;
      }
      // 6 — Cursor and foreign keys are typed text; model IDs are text primary keys.
      case PrimitiveKind.Cursor:
      case PrimitiveKind.ForeignKey: {
        const col = nullable
          ? drizzleText(key).$type<
              InferIdFromAbbreviation<typeof descriptor.abbreviation>
            >()
          : drizzleText(key)
              .$type<InferIdFromAbbreviation<typeof descriptor.abbreviation>>()
              .notNull();
        return descriptor.unique === true ? col.unique() : col;
      }
      case PrimitiveKind.PrimaryKey: {
        return drizzleText(key)
          .$type<InferIdFromAbbreviation<typeof descriptor.abbreviation>>()
          .primaryKey();
      }
      default: {
        return drizzleText(key);
      }
    }
  })();
  // 7 — Return the builder after the exhaustive descriptor dispatch.
  return column;
}

/*
 * 1. Resolve nullability and reusable UNIQUE SQL.
 * 2. Emit numeric and boolean column declarations.
 * 3. Emit text, JSON, date, and enum declarations with defaults.
 * 4. Emit reference and opaque identifier declarations.
 * 5. Emit primary keys or the defensive text fallback.
 */
export function generateProvisioningSqlForDescriptor(
  descriptor: IAnyPrimitiveDescriptor,
  columnName: string,
): string {
  // 1 — UNIQUE is valid for every supported non-JSON, non-primary descriptor.
  const nullable = descriptor.nullable === true;
  const uniqueSql = uniqueConstraintSql(descriptor);
  switch (descriptor.kind) {
    // 2 — Boolean, integer, and real descriptors use SQLite numeric storage
    // with encoded defaults, NOT NULL, uniqueness, and integer PK semantics.
    case PrimitiveKind.Boolean: {
      const defaultSql =
        descriptor.defaultValue === undefined
          ? ''
          : ` DEFAULT ${descriptor.defaultValue ? 1 : 0}`;
      return nullable
        ? `${columnName} integer${defaultSql}${uniqueSql}`
        : `${columnName} integer NOT NULL${defaultSql}${uniqueSql}`;
    }
    case PrimitiveKind.Integer: {
      if (descriptor.primaryKey === true) {
        return `${columnName} integer PRIMARY KEY`;
      }
      const defaultSql =
        descriptor.defaultValue === undefined
          ? ''
          : ` DEFAULT ${descriptor.defaultValue}`;
      return nullable
        ? `${columnName} integer${defaultSql}${uniqueSql}`
        : `${columnName} integer NOT NULL${defaultSql}${uniqueSql}`;
    }
    case PrimitiveKind.Number: {
      const defaultSql =
        descriptor.defaultValue === undefined
          ? ''
          : ` DEFAULT ${descriptor.defaultValue}`;
      return nullable
        ? `${columnName} real${defaultSql}${uniqueSql}`
        : `${columnName} real NOT NULL${defaultSql}${uniqueSql}`;
    }
    // 3 — Text-like, JSON, timestamp, and enum descriptors escape or encode
    // their authored defaults into the physical column declaration.
    case PrimitiveKind.Text: {
      const defaultSql =
        descriptor.defaultValue === undefined
          ? ''
          : descriptor.defaultValue === null
            ? ' DEFAULT NULL'
            : ` DEFAULT '${descriptor.defaultValue.replaceAll("'", "''")}'`;
      return nullable
        ? `${columnName} text${defaultSql}${uniqueSql}`
        : `${columnName} text NOT NULL${defaultSql}${uniqueSql}`;
    }
    case PrimitiveKind.Json: {
      const defaultSql =
        nullable && descriptor.defaultValue === null ? ' DEFAULT NULL' : '';
      return nullable
        ? `${columnName} text${defaultSql}${uniqueSql}`
        : `${columnName} text NOT NULL${uniqueSql}`;
    }
    case PrimitiveKind.Date: {
      const defaultSql =
        descriptor.defaultValue === undefined
          ? ''
          : ` DEFAULT ${descriptor.defaultValue.getTime()}`;
      return nullable
        ? `${columnName} integer${defaultSql}${uniqueSql}`
        : `${columnName} integer NOT NULL${defaultSql}${uniqueSql}`;
    }
    case PrimitiveKind.Enum: {
      const defaultSql =
        descriptor.defaultValue === undefined
          ? ''
          : ` DEFAULT '${descriptor.defaultValue.replaceAll("'", "''")}'`;
      return nullable
        ? `${columnName} text${defaultSql}${uniqueSql}`
        : `${columnName} text NOT NULL${defaultSql}${uniqueSql}`;
    }
    // 4 — References follow their target key kind; cursor and foreign keys use text.
    case PrimitiveKind.Ref: {
      if (descriptor.targetKind === PrimitiveKind.Integer) {
        return nullable
          ? `${columnName} integer${uniqueSql}`
          : `${columnName} integer NOT NULL${uniqueSql}`;
      }
      return nullable
        ? `${columnName} text${uniqueSql}`
        : `${columnName} text NOT NULL${uniqueSql}`;
    }
    case PrimitiveKind.Cursor:
    case PrimitiveKind.ForeignKey: {
      return nullable
        ? `${columnName} text${uniqueSql}`
        : `${columnName} text NOT NULL${uniqueSql}`;
    }
    // 5 — Model primary keys are non-null text; unknown descriptors retain the
    // defensive plain-text fallback used by this SQL generator.
    case PrimitiveKind.PrimaryKey: {
      return `${columnName} text PRIMARY KEY NOT NULL`;
    }
    default: {
      return `${columnName} text`;
    }
  }
}

export function makeEffectSchema<SHAPE extends IShape>(
  properties: SHAPE,
): Schema.Codec<InferDecodedRow<SHAPE>, InferEncodedRow<SHAPE>> &
  Schema.Struct<{
    [K in keyof SHAPE]: Schema.Codec<
      IPrimitiveDescriptorDecoded<SHAPE[K]>,
      IPrimitiveDescriptorEncoded<SHAPE[K]>
    >;
  }> {
  return Schema.Struct(
    mapValues(properties, descriptor => {
      if (
        ((descriptor.kind === PrimitiveKind.Boolean ||
          descriptor.kind === PrimitiveKind.Integer ||
          descriptor.kind === PrimitiveKind.Number ||
          descriptor.kind === PrimitiveKind.Text ||
          descriptor.kind === PrimitiveKind.Date ||
          descriptor.kind === PrimitiveKind.Enum) &&
          descriptor.defaultValue !== undefined) ||
        (descriptor.kind === PrimitiveKind.Json &&
          descriptor.nullable === true &&
          descriptor.defaultValue === null)
      ) {
        const { defaultValue } = descriptor;
        return descriptorToEffectSchema(descriptor).pipe(
          Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultValue)),
        );
      }
      return descriptorToEffectSchema(descriptor);
    }),
  ) as unknown as Schema.Codec<InferDecodedRow<SHAPE>, InferEncodedRow<SHAPE>> &
    Schema.Struct<{
      [K in keyof SHAPE]: Schema.Codec<
        IPrimitiveDescriptorDecoded<SHAPE[K]>,
        IPrimitiveDescriptorEncoded<SHAPE[K]>
      >;
    }>; // Effect Schema is contravariant
}

export function makeDrizzleSchema<
  TABLE_NAME extends string,
  COLUMNS extends IAnyShape,
>(
  tableName: TABLE_NAME,
  attributes: COLUMNS,
): IDrizzleSchema<TABLE_NAME, COLUMNS> {
  const columns = buildDrizzleColumnsFromShape(attributes);
  return sqliteTable(tableName, columns);
}

export function makeDrizzleSchemaFromTable<
  TABLE_NAME extends string,
  SHAPE extends IAnyShape,
>(
  table: ITable<TABLE_NAME, SHAPE>,
  resolveReference?: (descriptor: IAnyRefDescriptor) => () => AnySQLiteColumn,
): IDrizzleSchema<TABLE_NAME, SHAPE> {
  const { indexes, name, shape } = table;
  const columns = buildDrizzleColumnsFromShape(shape, resolveReference);
  if (indexes.length === 0) {
    return sqliteTable(name, columns);
  }
  return sqliteTable(name, columns, tableColumns =>
    indexes.map(indexConfig => {
      const [firstColumnName, ...otherColumnNames] = indexConfig.columns;
      const indexedTableColumns = tableColumns as Record<
        string,
        (typeof tableColumns)[keyof typeof tableColumns]
      >;
      const firstColumn = indexedTableColumns[firstColumnName]!;
      const otherColumns = otherColumnNames.map(
        columnName => indexedTableColumns[columnName]!,
      );
      const builder =
        indexConfig.unique === true
          ? uniqueIndex(indexConfig.name)
          : index(indexConfig.name);
      return builder.on(firstColumn, ...otherColumns);
    }),
  );
}

export function makeDrizzleSchemaFromEncodedTable(props: {
  name: string;
  shape: IEncodedShape;
  indexes: readonly IDrizzleIndexConfig<string>[];
}): IAnyDrizzleSchema {
  const { indexes, name, shape } = props;
  const columns = buildDrizzleColumnsFromEncodedShape(shape);
  if (indexes.length === 0) {
    return sqliteTable(name, columns);
  }
  return sqliteTable(name, columns, tableColumns =>
    indexes.map(indexConfig => {
      const [firstColumnName, ...otherColumnNames] = indexConfig.columns;
      const indexedTableColumns = tableColumns as Record<
        string,
        (typeof tableColumns)[keyof typeof tableColumns]
      >;
      const firstColumn = indexedTableColumns[firstColumnName]!;
      const otherColumns = otherColumnNames.map(
        columnName => indexedTableColumns[columnName]!,
      );
      const builder =
        indexConfig.unique === true
          ? uniqueIndex(indexConfig.name)
          : index(indexConfig.name);
      return builder.on(firstColumn, ...otherColumns);
    }),
  );
}
