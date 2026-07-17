import type { ColumnBuilderBase } from 'drizzle-orm/column-builder';
import {
  integer as drizzleInteger,
  real as drizzleReal,
  text as drizzleText,
  index,
  sqliteTable,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { Effect, ParseResult, Schema } from 'effect';
import { mapValues } from 'es-toolkit';

import type { CuidFactory } from '../services/CuidFactory.ts';
import { makeIdFromAbbreviation } from '../utils/makeIdFromAbbreviation.ts';

import type { IEncodedShape } from './encodeShape.ts';
import { makeAbbreviationIdSchema } from './makeIdSchema.ts';
import { PrimitiveKind } from './primitiveKind.ts';
import type {
  IAnyDrizzleSchema,
  IAnyPrimitiveDescriptor,
  IAnyShape,
  IDrizzleIndexConfig,
  IDrizzleSchema,
  InferDecodedRow,
  InferDrizzleColumnBuilderFromDescriptor,
  InferDrizzleColumnBuildersFromShape,
  InferEncodedRow,
  InferIdFromAbbreviation,
  IPrimaryKeyDescriptor,
  IShape,
  ITable,
} from './types.ts';

function buildDrizzleColumnsFromShape<SHAPE extends IAnyShape>(
  shape: SHAPE,
): InferDrizzleColumnBuildersFromShape<SHAPE> {
  return mapValues(shape, (descriptor, key) =>
    descriptorToDrizzleColumn({ key: String(key), descriptor }),
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

export function descriptorToEffectSchema<
  D extends IPrimaryKeyDescriptor & {
    autogenerate: true;
    modelName: string;
  },
>(
  descriptor: D,
): Schema.Schema<
  Schema.Schema.Type<Schema.Schema.Any>,
  Schema.Schema.Encoded<Schema.Schema.Any>,
  CuidFactory
>;
export function descriptorToEffectSchema<D extends IAnyPrimitiveDescriptor>(
  descriptor: D,
): Schema.Schema<
  Schema.Schema.Type<Schema.Schema.Any>,
  Schema.Schema.Encoded<Schema.Schema.Any>,
  never
>;
export function descriptorToEffectSchema(
  descriptor: IAnyPrimitiveDescriptor,
): Schema.Schema<
  Schema.Schema.Type<Schema.Schema.Any>,
  Schema.Schema.Encoded<Schema.Schema.Any>,
  CuidFactory | never
> {
  const nullable = descriptor.nullable === true;
  switch (descriptor.kind) {
    case PrimitiveKind.Boolean: {
      return nullable ? Schema.NullOr(Schema.Boolean) : Schema.Boolean;
    }
    case PrimitiveKind.Cursor: {
      const cursorSchema = makeAbbreviationIdSchema(descriptor.abbreviation);
      return nullable ? Schema.NullOr(cursorSchema) : cursorSchema;
    }
    case PrimitiveKind.OpaqueId: {
      const opaqueIdSchema = makeAbbreviationIdSchema(descriptor.abbreviation);
      return nullable ? Schema.NullOr(opaqueIdSchema) : opaqueIdSchema;
    }
    case PrimitiveKind.PrimaryKey: {
      const { abbreviation } = descriptor;
      const primaryKeySchema = makeAbbreviationIdSchema(abbreviation);
      if (
        'autogenerate' in descriptor &&
        descriptor.autogenerate === true &&
        'modelName' in descriptor
      ) {
        // Accept a missing/`null`/`undefined` model primary key and fill it
        // with the model abbreviation through CuidFactory during decode.
        return Schema.transformOrFail(
          Schema.NullishOr(primaryKeySchema),
          Schema.typeSchema(primaryKeySchema),
          {
            strict: true,
            decode: (value, _options, ast) =>
              value == null
                ? makeIdFromAbbreviation({ abbreviation }).pipe(
                    Effect.mapError(
                      error => new ParseResult.Type(ast, value, error.message),
                    ),
                  )
                : ParseResult.succeed(value),
            encode: value => ParseResult.succeed(value),
          },
        );
      }
      return primaryKeySchema;
    }
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
      const jsonSchema = Schema.parseJson(descriptor.schema);
      return nullable ? Schema.NullOr(jsonSchema) : jsonSchema;
    }
    case PrimitiveKind.Date: {
      return nullable
        ? Schema.NullOr(Schema.DateFromSelf)
        : Schema.DateFromSelf;
    }
    case PrimitiveKind.Enum: {
      const literal = Schema.Literal(...descriptor.values);
      return nullable ? Schema.NullOr(literal) : literal;
    }
    case PrimitiveKind.Ref: {
      const idSchema = makeAbbreviationIdSchema(descriptor.abbreviation);
      return nullable ? Schema.NullOr(idSchema) : idSchema;
    }
    default: {
      throw new Error(
        `Invalid attribute descriptor: ${JSON.stringify(descriptor)}`,
      );
    }
  }
}

export function descriptorToJsonEffectSchema<
  D extends IPrimaryKeyDescriptor & {
    autogenerate: true;
    modelName: string;
  },
>(
  descriptor: D,
): Schema.Schema<
  Schema.Schema.Type<Schema.Schema.Any>,
  Schema.Schema.Encoded<Schema.Schema.Any>,
  CuidFactory
>;
export function descriptorToJsonEffectSchema<D extends IAnyPrimitiveDescriptor>(
  descriptor: D,
): Schema.Schema<
  Schema.Schema.Type<Schema.Schema.Any>,
  Schema.Schema.Encoded<Schema.Schema.Any>,
  never
>;
export function descriptorToJsonEffectSchema(
  descriptor: IAnyPrimitiveDescriptor,
): Schema.Schema<
  Schema.Schema.Type<Schema.Schema.Any>,
  Schema.Schema.Encoded<Schema.Schema.Any>,
  CuidFactory | never
> {
  switch (descriptor.kind) {
    case PrimitiveKind.Date: {
      return descriptor.nullable === true
        ? Schema.NullOr(Schema.Date)
        : Schema.Date;
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
}): InferDrizzleColumnBuilderFromDescriptor<D>;
export function descriptorToDrizzleColumn(props: {
  key: string;
  descriptor: IEncodedShape[string];
}): ColumnBuilderBase;
export function descriptorToDrizzleColumn(props: {
  key: string;
  descriptor: IAnyPrimitiveDescriptor | IEncodedShape[string];
}): ColumnBuilderBase {
  const { key, descriptor } = props;
  const nullable = descriptor.nullable === true;
  const column: ColumnBuilderBase = (() => {
    switch (descriptor.kind) {
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
      case PrimitiveKind.Text: {
        let col = nullable ? drizzleText(key) : drizzleText(key).notNull();
        if (descriptor.defaultValue !== undefined) {
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
      case PrimitiveKind.Date: {
        let col = nullable
          ? drizzleInteger(key, { mode: 'timestamp' })
          : drizzleInteger(key, { mode: 'timestamp' }).notNull();
        if (descriptor.defaultValue !== undefined) {
          col = col.default(descriptor.defaultValue);
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
      case PrimitiveKind.Ref:
      case PrimitiveKind.Cursor:
      case PrimitiveKind.OpaqueId: {
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
  return column;
}

export function generateMigrationSqlForDescriptor(
  descriptor: IAnyPrimitiveDescriptor,
  columnName: string,
): string {
  const nullable = descriptor.nullable === true;
  const uniqueSql = uniqueConstraintSql(descriptor);
  switch (descriptor.kind) {
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
    case PrimitiveKind.Text: {
      const defaultSql =
        descriptor.defaultValue === undefined
          ? ''
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
          : ` DEFAULT ${Math.floor(descriptor.defaultValue.getTime() / 1000)}`;
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
    case PrimitiveKind.Ref:
    case PrimitiveKind.Cursor:
    case PrimitiveKind.OpaqueId: {
      return nullable
        ? `${columnName} text${uniqueSql}`
        : `${columnName} text NOT NULL${uniqueSql}`;
    }
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
): Schema.Schema<InferDecodedRow<SHAPE>, InferEncodedRow<SHAPE>> {
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
        return Schema.optionalWith(descriptorToEffectSchema(descriptor), {
          default: () => defaultValue,
          exact: true,
        });
      }
      return descriptorToEffectSchema(descriptor);
    }),
  ) as any as Schema.Schema<InferDecodedRow<SHAPE>, InferEncodedRow<SHAPE>>; // eslint-disable-line @typescript-eslint/no-explicit-any -- Effect Schema is contravariant
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
>(table: ITable<TABLE_NAME, SHAPE>): IDrizzleSchema<TABLE_NAME, SHAPE> {
  const { indexes, name, shape } = table;
  const columns = buildDrizzleColumnsFromShape(shape);
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
