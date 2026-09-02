import type {
  $Type,
  BuildColumns,
  ColumnBuilderBase,
  HasDefault,
  IsPrimaryKey,
  NotNull,
} from 'drizzle-orm/column-builder';
/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded type / generic defaults */
import type {
  AnySQLiteTable,
  SQLiteTableWithColumns,
} from 'drizzle-orm/sqlite-core';
import type { Effect, Schema } from 'effect';

import type { PrimitiveKind } from './primitiveKind.ts';

/** Compile-time-only error brand for generic constraints (`@ts-expect-error CoreTypeError`). */
export type ITypeError<T extends string> = {
  name: 'CoreTypeError';
  type: T;
};

export type ICuidFactory = () => Effect.Effect<string>;

/** A non-null, unique abbreviation-prefixed SQLite primary-key column. */
export type IPrimaryKeyDescriptor<ABBREVIATION extends string = string> = {
  kind: PrimitiveKind.PrimaryKey;
  nullable: false;
  unique: true;
  abbreviation: ABBREVIATION;
};

/** An opaque abbreviation-prefixed value with no relational meaning. */
export type IOpaqueIdDescriptor<
  NULLABLE extends boolean = boolean,
  ABBREVIATION extends string = string,
> = {
  kind: PrimitiveKind.OpaqueId;
  nullable: NULLABLE;
  unique: boolean;
  abbreviation: ABBREVIATION;
};

/** A same-database reference to the sole primary-key column of one concrete table. */
export type IRefDescriptor<
  NULLABLE extends boolean = boolean,
  ABBREVIATION extends string = string,
  TARGET_TABLE extends IAnyTable = IAnyTable,
  TARGET_COLUMN_NAME extends keyof TARGET_TABLE['shape'] & string =
    keyof TARGET_TABLE['shape'] & string,
  RELATION extends string = string,
  INVERSE extends string = string,
  UNIQUE extends boolean = boolean,
> = {
  kind: PrimitiveKind.Ref;
  nullable: NULLABLE;
  unique: UNIQUE;
  abbreviation: ABBREVIATION;
  /** Present only when the target uses SQLite's numeric `INTEGER PRIMARY KEY`. */
  targetKind?: PrimitiveKind.Integer;
  table: TARGET_TABLE;
  targetTableName: TARGET_TABLE['name'];
  targetColumnName: TARGET_COLUMN_NAME;
  relation: RELATION;
  inverse: INVERSE;
};

/** Monotonic cursor value with an abbreviation-scoped string encoding. */
export type ICursorDescriptor<
  NULLABLE extends boolean = boolean,
  ABBREVIATION extends string = string,
> = {
  kind: PrimitiveKind.Cursor;
  nullable: NULLABLE;
  unique: boolean;
  abbreviation: ABBREVIATION;
};

export type IBooleanDescriptor<
  NULLABLE extends boolean = boolean,
  DEFAULT_VALUE extends boolean | undefined = boolean | undefined,
> = {
  kind: PrimitiveKind.Boolean;
  nullable: NULLABLE;
  /** When true, column has a SQLite `UNIQUE` constraint. */
  unique: boolean;
  defaultValue?: DEFAULT_VALUE;
};

export type IIntegerDescriptor<
  NULLABLE extends boolean = boolean,
  DEFAULT_VALUE extends number | undefined = number | undefined,
> = {
  kind: PrimitiveKind.Integer;
  nullable: NULLABLE;
  /** When true, column has a SQLite `UNIQUE` constraint. */
  unique: boolean;
  /** When true, column is the table's SQLite `INTEGER PRIMARY KEY`. */
  primaryKey?: boolean;
  defaultValue?: DEFAULT_VALUE;
};

export type INumberDescriptor<
  NULLABLE extends boolean = boolean,
  DEFAULT_VALUE extends number | undefined = number | undefined,
> = {
  kind: PrimitiveKind.Number;
  nullable: NULLABLE;
  unique: boolean;
  defaultValue?: DEFAULT_VALUE;
};

export type ITextDescriptor<
  NULLABLE extends boolean = boolean,
  DEFAULT_VALUE extends
    | string
    | (true extends NULLABLE ? null : never)
    | undefined = string | (true extends NULLABLE ? null : never) | undefined,
> = {
  kind: PrimitiveKind.Text;
  nullable: NULLABLE;
  unique: boolean;
  defaultValue?: DEFAULT_VALUE;
};

export type IDateDescriptor<
  NULLABLE extends boolean = boolean,
  DEFAULT_VALUE extends Date | undefined = Date | undefined,
> = {
  kind: PrimitiveKind.Date;
  nullable: NULLABLE;
  unique: boolean;
  defaultValue?: DEFAULT_VALUE;
};

export type IEnumDescriptor<
  NULLABLE extends boolean = boolean,
  VALUES extends readonly [string, ...string[]] = readonly [
    string,
    ...string[],
  ],
  DEFAULT_VALUE extends VALUES[number] | undefined = VALUES[number] | undefined,
> = {
  kind: PrimitiveKind.Enum;
  values: VALUES;
  nullable: NULLABLE;
  unique: boolean;
  defaultValue?: DEFAULT_VALUE;
};

/**
 * JSON stored as SQLite `text`. `InferEncodedRow` stays wire `string`; `DATA` is the
 * domain type described by {@link IJsonDescriptor.schema}. `makeEffectSchema`
 * owns JSON encode/decode through the descriptor schema.
 */
export interface IJsonDescriptor<
  NULLABLE extends boolean = boolean,
  DATA = unknown,
  DEFAULT_VALUE extends null | undefined = null | undefined,
> {
  kind: PrimitiveKind.Json;
  nullable: NULLABLE;
  schema: Schema.Codec<NULLABLE extends true ? Exclude<DATA, null> : DATA, any>;
  defaultValue?: DEFAULT_VALUE;
}

/** Widened json primitive for {@link IPrimitiveDescriptor} unions. */
type IAnyJsonDescriptor = IJsonDescriptor<boolean, any>;

export type IPrimitiveDescriptor =
  | IPrimaryKeyDescriptor
  | IOpaqueIdDescriptor
  | IBooleanDescriptor
  | ICursorDescriptor
  | IIntegerDescriptor
  | INumberDescriptor
  | ITextDescriptor
  | IDateDescriptor
  | IEnumDescriptor
  | IAnyJsonDescriptor
  | IAnyRefDescriptor;

export type IAnyPrimitiveDescriptor =
  | IPrimaryKeyDescriptor
  | IOpaqueIdDescriptor
  | IBooleanDescriptor
  | ICursorDescriptor
  | IIntegerDescriptor
  | INumberDescriptor
  | ITextDescriptor
  | IDateDescriptor
  | IEnumDescriptor
  | IAnyJsonDescriptor
  | IAnyRefDescriptor;

export type IEncodedPrimitive =
  IPrimitiveKindEncodedMap[keyof IPrimitiveKindEncodedMap];

export type IDecodedPrimitive =
  IPrimitiveKindDecodedMap[keyof IPrimitiveKindDecodedMap];

export type IEncodedRecord = Record<string, IEncodedPrimitive>;

export type IDecodedRecord = Record<string, IDecodedPrimitive>;

/** Model / table attribute shapes (includes {@link PrimitiveKind.Ref} for FK columns). */
export type IShape = Record<string, IPrimitiveDescriptor>;

export type IAnyShape = Record<string, IAnyPrimitiveDescriptor>;

/** Widest ref shape for `extends` checks (works with `exactOptionalPropertyTypes`). */
export interface IAnyRefDescriptor {
  kind: PrimitiveKind.Ref;
  nullable: boolean;
  unique: boolean;
  abbreviation: string;
  targetKind?: PrimitiveKind.Integer;
  table: IAnyTable;
  targetTableName: string;
  targetColumnName: string;
  relation: string;
  inverse: string;
}

export type IAnyShapes = Record<string, IAnyShape>;

export type IDrizzleIndexConfig<COLUMN_NAME extends string = string> = {
  name: string;
  columns: readonly [COLUMN_NAME, ...COLUMN_NAME[]];
  unique?: boolean;
};

export type IDrizzleTableConfig<SHAPE extends IAnyShape = IAnyShape> = {
  indexes?: readonly IDrizzleIndexConfig<keyof SHAPE & string>[];
};

export type ITable<
  TABLE_NAME extends string = string,
  SHAPE extends IAnyShape = IAnyShape,
> = {
  name: TABLE_NAME;
  shape: SHAPE;
  indexes: readonly IDrizzleIndexConfig<keyof SHAPE & string>[];
};

export type IAnyTable = ITable<string, IAnyShape>;

export type IAnyTables = Record<string, IAnyTable>;

export type IPrimitiveKindDecodedMap = {
  [PrimitiveKind.Boolean]: boolean;
  [PrimitiveKind.Cursor]: string;
  [PrimitiveKind.Integer]: number;
  [PrimitiveKind.Number]: number;
  [PrimitiveKind.Text]: string;
  [PrimitiveKind.Date]: Date;
  [PrimitiveKind.Enum]: string;
  [PrimitiveKind.Json]: never;
  [PrimitiveKind.OpaqueId]: string;
  [PrimitiveKind.PrimaryKey]: string;
  [PrimitiveKind.Ref]: string;
};

export type IPrimitive =
  IPrimitiveKindDecodedMap[keyof IPrimitiveKindDecodedMap];

export type IPrimitiveKindEncodedMap = {
  [PrimitiveKind.Boolean]: boolean;
  [PrimitiveKind.Cursor]: string;
  [PrimitiveKind.Integer]: number;
  [PrimitiveKind.Number]: number;
  [PrimitiveKind.Text]: string;
  [PrimitiveKind.Date]: Date;
  [PrimitiveKind.Enum]: string;
  [PrimitiveKind.Json]: string;
  [PrimitiveKind.OpaqueId]: string;
  [PrimitiveKind.PrimaryKey]: string;
  [PrimitiveKind.Ref]: string;
};

/** Union of encoded scalar values for every {@link PrimitiveKind}. */
export type IPrimitiveKindEncoded =
  IPrimitiveKindEncodedMap[keyof IPrimitiveKindEncodedMap];

export type IPrimitiveDescriptorDecoded<T extends IAnyPrimitiveDescriptor> =
  T extends
    | IPrimaryKeyDescriptor
    | IOpaqueIdDescriptor
    | ICursorDescriptor
    | IAnyRefDescriptor
    ? T extends IAnyRefDescriptor & { targetKind: PrimitiveKind.Integer }
      ? T extends { nullable: true }
        ? number | null
        : number
      : string extends T['abbreviation']
        ? T extends { nullable: true }
          ? string | null
          : string
        : T extends { nullable: true }
          ? `${T['abbreviation']}_${string}` | null
          : `${T['abbreviation']}_${string}`
    : T extends IBooleanDescriptor<infer NULLABLE, infer _DEFAULT_VALUE>
      ? NULLABLE extends true
        ? boolean | null
        : boolean
      : T extends IIntegerDescriptor<infer NULLABLE, infer _DEFAULT_VALUE>
        ? NULLABLE extends true
          ? number | null
          : number
        : T extends IJsonDescriptor<
              infer NULLABLE,
              infer DATA,
              infer _DEFAULT_VALUE
            >
          ? NULLABLE extends true
            ? DATA | null
            : DATA
          : T extends IDateDescriptor<infer NULLABLE, infer _DEFAULT_VALUE>
            ? NULLABLE extends true
              ? Date | null
              : Date
            : T extends IEnumDescriptor<
                  infer NULLABLE,
                  infer VALUES,
                  infer _DEFAULT_VALUE
                >
              ? NULLABLE extends true
                ? VALUES[number] | null
                : VALUES[number]
              : T extends { nullable: true }
                ? IPrimitiveKindDecodedMap[T['kind']] | null
                : IPrimitiveKindDecodedMap[T['kind']];

export type IPrimitiveDescriptorEncoded<T extends IAnyPrimitiveDescriptor> =
  T extends
    | IPrimaryKeyDescriptor
    | IOpaqueIdDescriptor
    | ICursorDescriptor
    | IAnyRefDescriptor
    ? T extends IAnyRefDescriptor & { targetKind: PrimitiveKind.Integer }
      ? T extends { nullable: true }
        ? number | null
        : number
      : string extends T['abbreviation']
        ? T extends { nullable: true }
          ? string | null
          : string
        : T extends { nullable: true }
          ? `${T['abbreviation']}_${string}` | null
          : `${T['abbreviation']}_${string}`
    : T extends IBooleanDescriptor<infer NULLABLE, infer _DEFAULT_VALUE>
      ? NULLABLE extends true
        ? boolean | null
        : boolean
      : T extends IIntegerDescriptor<infer NULLABLE, infer _DEFAULT_VALUE>
        ? NULLABLE extends true
          ? number | null
          : number
        : T extends IJsonDescriptor<
              infer NULLABLE,
              infer _DATA,
              infer _DEFAULT_VALUE
            >
          ? NULLABLE extends true
            ? string | null
            : string
          : T extends IEnumDescriptor<
                infer NULLABLE,
                infer VALUES,
                infer _DEFAULT_VALUE
              >
            ? NULLABLE extends true
              ? VALUES[number] | null
              : VALUES[number]
            : T extends { nullable: true }
              ? IPrimitiveKindEncodedMap[T['kind']] | null
              : IPrimitiveKindEncodedMap[T['kind']];

export type InferDecodedRow<SHAPE extends IAnyShape> = {
  [K in keyof SHAPE]: IPrimitiveDescriptorDecoded<SHAPE[K]>;
};

export type InferEncodedRow<SHAPE extends IAnyShape> = {
  [K in keyof SHAPE]: IPrimitiveDescriptorEncoded<SHAPE[K]>;
};

/** Minimal sqlite text builder config for type-level column mapping. */
type ISqliteTextBuilder = ColumnBuilderBase<{
  dataType: 'string';
  data: string;
  driverParam: unknown;
}>;

type ISqliteNumberBuilder = ColumnBuilderBase<{
  dataType: 'number';
  data: number;
  driverParam: unknown;
}>;

type ISqliteBooleanBuilder = ColumnBuilderBase<{
  dataType: 'number';
  data: boolean;
  driverParam: unknown;
}>;

type ISqliteDateBuilder = ColumnBuilderBase<{
  dataType: 'number';
  data: Date;
  driverParam: unknown;
}>;

type IEncodedTextColumn<
  NULLABLE extends boolean,
  DATA extends string,
> = NULLABLE extends true
  ? $Type<ISqliteTextBuilder, DATA | null>
  : NotNull<$Type<ISqliteTextBuilder, DATA>>;

type IEncodedNumberColumn<NULLABLE extends boolean> = NULLABLE extends true
  ? ISqliteNumberBuilder
  : NotNull<ISqliteNumberBuilder>;

type IEncodedBooleanColumn<NULLABLE extends boolean> = NULLABLE extends true
  ? ISqliteBooleanBuilder
  : NotNull<ISqliteBooleanBuilder>;

type IEncodedDateColumn<NULLABLE extends boolean> = NULLABLE extends true
  ? ISqliteDateBuilder
  : NotNull<ISqliteDateBuilder>;

/**
 * Maps a primitive descriptor to the Drizzle column builder shape produced by
 * {@link descriptorToDrizzleColumn} (sqlite `BuildColumns` input).
 */
export type InferDrizzleColumnBuilderFromDescriptor<
  D extends IAnyPrimitiveDescriptor,
> =
  D extends IPrimaryKeyDescriptor<infer ABBREVIATION>
    ? IsPrimaryKey<
        $Type<
          ISqliteTextBuilder,
          string extends ABBREVIATION ? string : `${ABBREVIATION}_${string}`
        >
      >
    : D extends IBooleanDescriptor<infer NULLABLE, infer DEFAULT_VALUE>
      ? [DEFAULT_VALUE] extends [boolean]
        ? HasDefault<IEncodedBooleanColumn<NULLABLE>>
        : IEncodedBooleanColumn<NULLABLE>
      : D extends ICursorDescriptor<infer NULLABLE, infer ABBREVIATION>
        ? IEncodedTextColumn<
            NULLABLE,
            string extends ABBREVIATION ? string : `${ABBREVIATION}_${string}`
          >
        : D extends IOpaqueIdDescriptor<infer NULLABLE, infer ABBREVIATION>
          ? IEncodedTextColumn<
              NULLABLE,
              string extends ABBREVIATION ? string : `${ABBREVIATION}_${string}`
            >
          : D extends IIntegerDescriptor<infer NULLABLE, infer DEFAULT_VALUE>
            ? D extends { primaryKey: true }
              ? IsPrimaryKey<IEncodedNumberColumn<false>>
              : [DEFAULT_VALUE] extends [number]
                ? HasDefault<IEncodedNumberColumn<NULLABLE>>
                : IEncodedNumberColumn<NULLABLE>
            : D extends INumberDescriptor<infer NULLABLE, infer DEFAULT_VALUE>
              ? [DEFAULT_VALUE] extends [number]
                ? HasDefault<IEncodedNumberColumn<NULLABLE>>
                : IEncodedNumberColumn<NULLABLE>
              : D extends ITextDescriptor<infer NULLABLE, infer DEFAULT_VALUE>
                ? [DEFAULT_VALUE] extends [string | null]
                  ? HasDefault<IEncodedTextColumn<NULLABLE, string>>
                  : IEncodedTextColumn<NULLABLE, string>
                : D extends IJsonDescriptor<
                      infer NULLABLE,
                      infer _DATA,
                      infer DEFAULT_VALUE
                    >
                  ? [DEFAULT_VALUE] extends [null]
                    ? NULLABLE extends true
                      ? HasDefault<IEncodedTextColumn<NULLABLE, string>>
                      : IEncodedTextColumn<NULLABLE, string>
                    : IEncodedTextColumn<NULLABLE, string>
                  : D extends IDateDescriptor<
                        infer NULLABLE,
                        infer DEFAULT_VALUE
                      >
                    ? [DEFAULT_VALUE] extends [Date]
                      ? HasDefault<IEncodedDateColumn<NULLABLE>>
                      : IEncodedDateColumn<NULLABLE>
                    : D extends IEnumDescriptor<
                          infer NULLABLE,
                          infer VALUES extends readonly [string, ...string[]],
                          infer DEFAULT_VALUE
                        >
                      ? [DEFAULT_VALUE] extends [VALUES[number]]
                        ? HasDefault<
                            IEncodedTextColumn<NULLABLE, VALUES[number]>
                          >
                        : IEncodedTextColumn<NULLABLE, VALUES[number]>
                      : D extends IRefDescriptor<
                            infer NULLABLE,
                            infer ABBREVIATION extends string,
                            infer _TARGET_TABLE,
                            infer _TARGET_COLUMN_NAME,
                            infer _RELATION,
                            infer _INVERSE,
                            infer _UNIQUE
                          >
                        ? D extends {
                            targetKind: PrimitiveKind.Integer;
                          }
                          ? D extends { nullable: true }
                            ? IEncodedNumberColumn<true>
                            : IEncodedNumberColumn<false>
                          : IEncodedTextColumn<
                              NULLABLE,
                              string extends ABBREVIATION
                                ? string
                                : `${ABBREVIATION}_${string}`
                            >
                        : ISqliteTextBuilder;

export type InferDrizzleColumnBuildersFromShape<SHAPE extends IAnyShape> = {
  [K in keyof SHAPE]: InferDrizzleColumnBuilderFromDescriptor<SHAPE[K]>;
};

type IDrizzleSQLiteTable<
  MODEL_NAME extends string,
  PROPERTIES extends IAnyShape,
> = {
  name: MODEL_NAME;
  schema: undefined;
  columns: BuildColumns<
    MODEL_NAME,
    InferDrizzleColumnBuildersFromShape<PROPERTIES>,
    'sqlite'
  >;
  dialect: 'sqlite';
};

export type IDrizzleSchema<
  MODEL_NAME extends string = string,
  PROPERTIES extends IAnyShape = IShape,
> = SQLiteTableWithColumns<IDrizzleSQLiteTable<MODEL_NAME, PROPERTIES>>;

/** Widest sqlite table in a `drizzle({ schema })` record (zerospin `IDrizzleSchema`, raw `sqliteTable`, merged repo schemas). */
export type IAnyDrizzleSchema = AnySQLiteTable;

export type IAnyDrizzleSchemas = Record<string, IAnyDrizzleSchema>;

export type InferIdFromAbbreviation<ABBREVIATION extends string = string> =
  `${ABBREVIATION}_${string}`;
