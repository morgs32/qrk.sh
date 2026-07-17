import type { IAnyError } from '@zerospin/error';
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
import type { Effect, JSONSchema, Schema } from 'effect';
import { type Brand, type BrandTypeId } from 'effect/Brand';
import { assert, type Equals } from 'tsafe';

import type { ICreateMutation } from '../contracts/createMutation.ts';
import type { IDeleteMutation } from '../contracts/deleteMutation.ts';
import type { IMoveMutation } from '../contracts/moveMutation.ts';
import type { IReplicateResourceMutation } from '../contracts/replicateResource.ts';
import type { IUpdateMutation } from '../contracts/updateMutation.ts';
import { type CuidFactory } from '../services/CuidFactory.ts';
import { type coreAbbreviations } from '../utils/coreAbbreviations.ts';
import type { ITypeError } from '../utils/types.ts';

import { type PrimitiveKind } from './primitiveKind.ts';

// --- model ---

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
  DEFAULT_VALUE extends string | undefined = string | undefined,
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
  schema: Schema.Schema<
    NULLABLE extends true ? Exclude<DATA, null> : DATA,
    any
  >;
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

export type IProperties = IResourceShape & IShape;

export type IEncodedProperties = InferEncodedRow<IProperties>;
export type IDecodedProperties = InferDecodedRow<IProperties>;

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
    ? string extends T['abbreviation']
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
    ? string extends T['abbreviation']
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

/**
 * Caller payload **input** for contracts: id fields with `autogenerate: true`
 * may be omitted, `undefined`, or `null`. Scalar fields and nullable json fields
 * with `defaultValue` may be omitted. `validatePayload` fills both via
 * `descriptorToEffectSchema`.
 * Other fields match {@link InferDecodedRow}.
 */
export type InferPayloadInput<SHAPE extends IAnyShape> = Prettify<
  {
    [K in keyof SHAPE as SHAPE[K] extends { autogenerate: true }
      ? never
      : SHAPE[K] extends {
            kind:
              | PrimitiveKind.Boolean
              | PrimitiveKind.Integer
              | PrimitiveKind.Number
              | PrimitiveKind.Text
              | PrimitiveKind.Date
              | PrimitiveKind.Enum
              | PrimitiveKind.Json;
            defaultValue?: infer DEFAULT_VALUE;
          }
        ? [undefined] extends [DEFAULT_VALUE]
          ? K
          : unknown extends DEFAULT_VALUE
            ? K
            : never
        : K]: IPrimitiveDescriptorDecoded<SHAPE[K]>;
  } & {
    [K in keyof SHAPE as SHAPE[K] extends { autogenerate: true }
      ? K
      : SHAPE[K] extends {
            kind:
              | PrimitiveKind.Boolean
              | PrimitiveKind.Integer
              | PrimitiveKind.Number
              | PrimitiveKind.Text
              | PrimitiveKind.Date
              | PrimitiveKind.Enum
              | PrimitiveKind.Json;
            defaultValue?: infer DEFAULT_VALUE;
          }
        ? [undefined] extends [DEFAULT_VALUE]
          ? never
          : unknown extends DEFAULT_VALUE
            ? never
            : K
        : never]?: SHAPE[K] extends { autogenerate: true }
      ? IPrimitiveDescriptorDecoded<SHAPE[K]> | null | undefined
      : IPrimitiveDescriptorDecoded<SHAPE[K]>;
  }
>;

/** Command / contract program payload after `autogenerate: true` id fields are filled (non-null ids). */
export type InferCommandPayload<SHAPE extends IAnyShape> = {
  [K in keyof SHAPE]: SHAPE[K] extends { autogenerate: true }
    ? Exclude<IPrimitiveDescriptorDecoded<SHAPE[K]>, null>
    : IPrimitiveDescriptorDecoded<SHAPE[K]>;
};

export type InferEncodedRow<SHAPE extends IAnyShape> = {
  [K in keyof SHAPE]: IPrimitiveDescriptorEncoded<SHAPE[K]>;
};

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

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
            ? [DEFAULT_VALUE] extends [number]
              ? HasDefault<IEncodedNumberColumn<NULLABLE>>
              : IEncodedNumberColumn<NULLABLE>
            : D extends INumberDescriptor<infer NULLABLE, infer DEFAULT_VALUE>
              ? [DEFAULT_VALUE] extends [number]
                ? HasDefault<IEncodedNumberColumn<NULLABLE>>
                : IEncodedNumberColumn<NULLABLE>
              : D extends ITextDescriptor<infer NULLABLE, infer DEFAULT_VALUE>
                ? [DEFAULT_VALUE] extends [string]
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
                        ? IEncodedTextColumn<
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

export type IResourceShape = {
  id: IPrimaryKeyDescriptor;
  modelName: ITextDescriptor<false>;
  createdAt: IDateDescriptor<false>;
  updatedAt: IDateDescriptor<false>;
  version: ITextDescriptor<false>;
};

/**
 * Full persisted row descriptors: caller-declared {@link ATTRIBUTES} plus standard metadata
 * columns (abbreviation-scoped primary key replaces generic {@link IResourceShape} `id`).
 */
export type InferProperties<
  ATTRIBUTES extends IShape,
  ABBREVIATION extends string = string,
> = ATTRIBUTES &
  Omit<IResourceShape, 'id'> & {
    id: IPrimaryKeyDescriptor<ABBREVIATION>;
  };

export type IDecodedResource = InferDecodedRow<IResourceShape>;

export type IEncodedResourceShape = InferEncodedRow<IResourceShape> &
  Record<string, unknown>;

export type IEncodedResource = Readonly<IEncodedResourceShape> &
  Brand<'EncodedResource'>;

export type IDrizzleSchema<
  MODEL_NAME extends string = string,
  PROPERTIES extends IAnyShape = IShape,
> = SQLiteTableWithColumns<IDrizzleSQLiteTable<MODEL_NAME, PROPERTIES>>;

/** Widest sqlite table in a `drizzle({ schema })` record (zerospin `IDrizzleSchema`, raw `sqliteTable`, merged repo schemas). */
export type IAnyDrizzleSchema = AnySQLiteTable;

export type IAnyDrizzleSchemas = Record<string, IAnyDrizzleSchema>;

export type IDrizzleResourceTable = SQLiteTableWithColumns<
  IDrizzleSQLiteTable<string, IResourceShape>
>;

/** Keys merged by {@link makeModel}; not part of payload / {@link IModel.attributesSchema}. */
export type IModelReservedAttributeKeys =
  | 'createdAt'
  | 'id'
  | 'modelName'
  | 'updatedAt'
  | 'version';

/** Strips persisted metadata columns from a full {@link InferProperties} shape → declared attributes shape. */
export type InferModelAttributesShape<PROPERTIES extends IShape> = Omit<
  PROPERTIES,
  IModelReservedAttributeKeys
>;

/** Serializable model metadata and JSON Schemas for deploy specs and RPC. */
export type IModelSpec = {
  readonly modelName: string;
  readonly abbreviation: string;
  readonly version: string;
  readonly attributes: readonly string[];
  readonly attributesJsonSchema: JSONSchema.JsonSchema7Root;
  readonly propertiesJsonSchema: JSONSchema.JsonSchema7Root;
  readonly indexes: readonly IDrizzleIndexConfig<string>[];
};

/**
 * Caller-declared attribute descriptors (`makeModel`'s `attributes` input shape).
 * {@link InferProperties}, {@link InferResource}, and Drizzle / full-row schemas incorporate metadata separately.
 */
export type IModel<
  ATTRIBUTES extends IShape = any,
  ABBREVIATION extends string = string,
  MODEL_NAME extends string = string,
  VERSION extends string = string,
  HISTORICAL_DEFINITIONS extends readonly {
    readonly abbreviation: string;
    readonly attributes: IShape;
    readonly indexes: readonly IDrizzleIndexConfig<string>[];
    readonly modelName: string;
    readonly version: string;
  }[] = readonly {
    readonly abbreviation: string;
    readonly attributes: IShape;
    readonly indexes: readonly IDrizzleIndexConfig<string>[];
    readonly modelName: string;
    readonly version: string;
  }[],
> = {
  abbreviation: ABBREVIATION;
  attributes: ATTRIBUTES;
  indexes: readonly IDrizzleIndexConfig<
    keyof InferProperties<ATTRIBUTES, ABBREVIATION> & string
  >[];
  historicalDefinitions: HISTORICAL_DEFINITIONS;
  modelName: MODEL_NAME;
  version: VERSION;
  makeId: () => Effect.Effect<
    InferIdFromAbbreviation<ABBREVIATION>,
    IAnyError,
    CuidFactory
  >;
  primaryKey: <AUTOGENERATE extends boolean>(props: {
    autogenerate: AUTOGENERATE;
  }) => IPrimaryKeyDescriptor<ABBREVIATION> & {
    readonly autogenerate: AUTOGENERATE;
    readonly modelName: MODEL_NAME;
  };
  prefixId: (id: string) => InferIdFromAbbreviation<ABBREVIATION>;
  propertiesShape: InferProperties<ATTRIBUTES, ABBREVIATION>;
  table: ITable<MODEL_NAME, InferProperties<ATTRIBUTES, ABBREVIATION>>;
  drizzleSchema: IDrizzleResourceTable & {
    [BrandTypeId]: 'drizzleSchema';
  };
  attributesSchema: Schema.Schema<any, any> & {
    [BrandTypeId]: 'attributesSchema';
  };
  resourceSchema: Schema.Schema<any, any>;
  spec: IModelSpec;
} & (string extends VERSION
  ? {
      createMutation: (...args: any[]) => Schema.Schema.AnyNoContext;
      create: (...args: any[]) => Effect.Effect<any, any, any>;
      updateMutation: (...args: any[]) => Schema.Schema.AnyNoContext;
      update: (...args: any[]) => Effect.Effect<any, any, any>;
      deleteMutation: (...args: any[]) => Schema.Schema.AnyNoContext;
      delete: (...args: any[]) => Effect.Effect<any, any, any>;
      moveMutation: (...args: any[]) => Schema.Schema.AnyNoContext;
      move: (...args: any[]) => Effect.Effect<any, any, any>;
      replicateResourceMutation: (...args: any[]) =>
        Schema.Schema.AnyNoContext;
      replicateResource: (...args: any[]) => Effect.Effect<any, any, any>;
    }
  : {
      createMutation: <
        MODEL_VERSION extends
          | VERSION
          | HISTORICAL_DEFINITIONS[number]['version'],
      >(
        modelVersion: MODEL_VERSION,
      ) => Schema.Schema<
        ICreateMutation<
          IModel<
            ATTRIBUTES,
            ABBREVIATION,
            MODEL_NAME,
            VERSION,
            HISTORICAL_DEFINITIONS
          >,
          MODEL_VERSION extends VERSION
            ? ATTRIBUTES
            : Extract<
                HISTORICAL_DEFINITIONS[number],
                { readonly version: MODEL_VERSION }
              >['attributes']
        >,
        Readonly<{
          modelName: MODEL_NAME;
          modelVersion: MODEL_VERSION;
          operationName: 'create';
          resourceId: InferIdFromAbbreviation<ABBREVIATION>;
          operation: {
            readonly attributes: InferEncodedRow<
              MODEL_VERSION extends VERSION
                ? ATTRIBUTES
                : Extract<
                    HISTORICAL_DEFINITIONS[number],
                    { readonly version: MODEL_VERSION }
                  >['attributes']
            >;
          };
        }>
      >;
      create: <
        MODEL_VERSION extends
          | VERSION
          | HISTORICAL_DEFINITIONS[number]['version'],
      >(
        modelVersion: MODEL_VERSION,
        props: {
          readonly resourceId: InferIdFromAbbreviation<ABBREVIATION>;
          readonly attributes: InferDecodedRow<
            MODEL_VERSION extends VERSION
              ? ATTRIBUTES
              : Extract<
                  HISTORICAL_DEFINITIONS[number],
                  { readonly version: MODEL_VERSION }
                >['attributes']
          >;
        },
      ) => Effect.Effect<
        ICreateMutation<
          IModel<
            ATTRIBUTES,
            ABBREVIATION,
            MODEL_NAME,
            VERSION,
            HISTORICAL_DEFINITIONS
          >,
          MODEL_VERSION extends VERSION
            ? ATTRIBUTES
            : Extract<
                HISTORICAL_DEFINITIONS[number],
                { readonly version: MODEL_VERSION }
              >['attributes']
        >,
        IAnyError
      >;
      updateMutation: <
        MODEL_VERSION extends
          | VERSION
          | HISTORICAL_DEFINITIONS[number]['version'],
      >(
        modelVersion: MODEL_VERSION,
      ) => Schema.Schema<
        IUpdateMutation<
          IModel<
            ATTRIBUTES,
            ABBREVIATION,
            MODEL_NAME,
            VERSION,
            HISTORICAL_DEFINITIONS
          >,
          MODEL_VERSION extends VERSION
            ? ATTRIBUTES
            : Extract<
                HISTORICAL_DEFINITIONS[number],
                { readonly version: MODEL_VERSION }
              >['attributes']
        >,
        Readonly<{
          modelName: MODEL_NAME;
          modelVersion: MODEL_VERSION;
          operationName: 'update';
          resourceId: InferIdFromAbbreviation<ABBREVIATION>;
          operation: {
            readonly attributes: Partial<
              InferEncodedRow<
                MODEL_VERSION extends VERSION
                  ? ATTRIBUTES
                  : Extract<
                      HISTORICAL_DEFINITIONS[number],
                      { readonly version: MODEL_VERSION }
                    >['attributes']
              >
            >;
            readonly mask?: string[];
          };
        }>
      >;
      update: <
        MODEL_VERSION extends
          | VERSION
          | HISTORICAL_DEFINITIONS[number]['version'],
      >(
        modelVersion: MODEL_VERSION,
        props: {
          readonly resourceId: InferIdFromAbbreviation<ABBREVIATION>;
          readonly attributes: Partial<
            InferDecodedRow<
              MODEL_VERSION extends VERSION
                ? ATTRIBUTES
                : Extract<
                    HISTORICAL_DEFINITIONS[number],
                    { readonly version: MODEL_VERSION }
                  >['attributes']
            >
          >;
          readonly mask?: ReadonlyArray<
            keyof InferDecodedRow<
              MODEL_VERSION extends VERSION
                ? ATTRIBUTES
                : Extract<
                    HISTORICAL_DEFINITIONS[number],
                    { readonly version: MODEL_VERSION }
                  >['attributes']
            > &
              string
          >;
        },
      ) => Effect.Effect<
        IUpdateMutation<
          IModel<
            ATTRIBUTES,
            ABBREVIATION,
            MODEL_NAME,
            VERSION,
            HISTORICAL_DEFINITIONS
          >,
          MODEL_VERSION extends VERSION
            ? ATTRIBUTES
            : Extract<
                HISTORICAL_DEFINITIONS[number],
                { readonly version: MODEL_VERSION }
              >['attributes']
        >,
        IAnyError
      >;
      deleteMutation: <
        MODEL_VERSION extends
          | VERSION
          | HISTORICAL_DEFINITIONS[number]['version'],
      >(
        modelVersion: MODEL_VERSION,
      ) => Schema.Schema<
        IDeleteMutation<
          IModel<
            ATTRIBUTES,
            ABBREVIATION,
            MODEL_NAME,
            VERSION,
            HISTORICAL_DEFINITIONS
          >
        >,
        Readonly<{
          modelName: MODEL_NAME;
          modelVersion: MODEL_VERSION;
          operationName: 'delete';
          resourceId: InferIdFromAbbreviation<ABBREVIATION>;
          operation: Record<string, never>;
        }>
      >;
      delete: <
        MODEL_VERSION extends
          | VERSION
          | HISTORICAL_DEFINITIONS[number]['version'],
      >(
        modelVersion: MODEL_VERSION,
        props: {
          readonly resourceId: InferIdFromAbbreviation<ABBREVIATION>;
        },
      ) => Effect.Effect<
        IDeleteMutation<
          IModel<
            ATTRIBUTES,
            ABBREVIATION,
            MODEL_NAME,
            VERSION,
            HISTORICAL_DEFINITIONS
          >
        >,
        IAnyError
      >;
      moveMutation: <
        MODEL_VERSION extends
          | VERSION
          | HISTORICAL_DEFINITIONS[number]['version'],
      >(
        modelVersion: MODEL_VERSION,
      ) => Schema.Schema<
        IMoveMutation<
          IModel<
            ATTRIBUTES,
            ABBREVIATION,
            MODEL_NAME,
            VERSION,
            HISTORICAL_DEFINITIONS
          >
        >,
        Readonly<{
          modelName: MODEL_NAME;
          modelVersion: MODEL_VERSION;
          operationName: 'move';
          resourceId: InferIdFromAbbreviation<ABBREVIATION>;
          operation: {
            readonly property: string;
            readonly prevId: string;
            readonly nextId: string;
          };
        }>
      >;
      move: <
        MODEL_VERSION extends
          | VERSION
          | HISTORICAL_DEFINITIONS[number]['version'],
      >(
        modelVersion: MODEL_VERSION,
        props: {
          readonly resourceId: InferIdFromAbbreviation<ABBREVIATION>;
          readonly property: string;
          readonly prevId: string;
          readonly nextId: string;
        },
      ) => Effect.Effect<
        IMoveMutation<
          IModel<
            ATTRIBUTES,
            ABBREVIATION,
            MODEL_NAME,
            VERSION,
            HISTORICAL_DEFINITIONS
          >
        >,
        IAnyError
      >;
      replicateResourceMutation: <
        SERVICE_NAME extends string,
        MODEL_VERSION extends
          | VERSION
          | HISTORICAL_DEFINITIONS[number]['version'],
      >(
        this: IServiceModel<
          IModel<
            ATTRIBUTES,
            ABBREVIATION,
            MODEL_NAME,
            VERSION,
            HISTORICAL_DEFINITIONS
          >,
          SERVICE_NAME
        >,
        modelVersion: MODEL_VERSION,
      ) => Schema.Schema<
        IReplicateResourceMutation<
          IServiceModel<
            IModel<
              ATTRIBUTES,
              ABBREVIATION,
              MODEL_NAME,
              VERSION,
              HISTORICAL_DEFINITIONS
            >,
            SERVICE_NAME
          >,
          MODEL_VERSION extends VERSION
            ? ATTRIBUTES
            : Extract<
                HISTORICAL_DEFINITIONS[number],
                { readonly version: MODEL_VERSION }
              >['attributes']
        >,
        Readonly<{
          modelName: MODEL_NAME;
          modelVersion: MODEL_VERSION;
          operationName: 'replicateResource';
          resourceId: InferIdFromAbbreviation<ABBREVIATION>;
          operation: {
            readonly serviceName: SERVICE_NAME;
            readonly resource: InferEncodedRow<
              InferProperties<
                MODEL_VERSION extends VERSION
                  ? ATTRIBUTES
                  : Extract<
                      HISTORICAL_DEFINITIONS[number],
                      { readonly version: MODEL_VERSION }
                    >['attributes'],
                ABBREVIATION
              >
            >;
          };
        }>
      >;
      replicateResource: <
        SERVICE_NAME extends string,
        MODEL_VERSION extends
          | VERSION
          | HISTORICAL_DEFINITIONS[number]['version'],
      >(
        this: IServiceModel<
          IModel<
            ATTRIBUTES,
            ABBREVIATION,
            MODEL_NAME,
            VERSION,
            HISTORICAL_DEFINITIONS
          >,
          SERVICE_NAME
        >,
        modelVersion: MODEL_VERSION,
        props: {
          readonly resource: InferResource<
            IModel<
              ATTRIBUTES,
              ABBREVIATION,
              MODEL_NAME,
              VERSION,
              HISTORICAL_DEFINITIONS
            >,
            MODEL_VERSION extends VERSION
              ? ATTRIBUTES
              : Extract<
                  HISTORICAL_DEFINITIONS[number],
                  { readonly version: MODEL_VERSION }
                >['attributes']
          >;
        },
      ) => Effect.Effect<
        IReplicateResourceMutation<
          IServiceModel<
            IModel<
              ATTRIBUTES,
              ABBREVIATION,
              MODEL_NAME,
              VERSION,
              HISTORICAL_DEFINITIONS
            >,
            SERVICE_NAME
          >,
          MODEL_VERSION extends VERSION
            ? ATTRIBUTES
            : Extract<
                HISTORICAL_DEFINITIONS[number],
                { readonly version: MODEL_VERSION }
              >['attributes']
        >,
        IAnyError
      >;
    });

export type IServiceModel<
  MODEL extends IModel = IModel,
  SERVICE_NAME extends string = string,
> = MODEL & {
  readonly serviceName: SERVICE_NAME;
};

export type InferResource<
  MODEL extends IModel,
  ATTRIBUTES extends IShape = MODEL['attributes'],
> = IDecodedResource &
  InferDecodedRow<InferProperties<ATTRIBUTES, MODEL['abbreviation']>>;

export type InferEncodedResource<MODEL extends IModel> = InferEncodedRow<
  InferProperties<MODEL['attributes'], MODEL['abbreviation']>
>;

export type InferPropertiesTable<MODEL extends IModel> = IDrizzleSchema<
  MODEL['modelName'],
  InferProperties<MODEL['attributes'], MODEL['abbreviation']>
> & {
  [BrandTypeId]: 'drizzleSchema';
};

export type InferAttributesSchema<MODEL extends IModel> = Schema.Schema<
  InferDecodedRow<MODEL['attributes']>,
  InferEncodedRow<MODEL['attributes']>
> & {
  [BrandTypeId]: 'attributesSchema';
};

export type IModels = Record<string, IModel>;

export type IAssertValidModels<MODELS extends IModels> = {
  [K in keyof MODELS & string]: K extends MODELS[K]['modelName']
    ? MODELS[K]['modelName'] extends K
      ? {
          [ATTRIBUTE_KEY in keyof MODELS[K]['attributes'] &
            string]: MODELS[K]['attributes'][ATTRIBUTE_KEY] extends IAnyRefDescriptor
            ? MODELS[K]['attributes'][ATTRIBUTE_KEY]['targetTableName'] extends infer TARGET_MODEL_NAME extends
                keyof MODELS & string
              ? MODELS[TARGET_MODEL_NAME]['table'] extends MODELS[K]['attributes'][ATTRIBUTE_KEY]['table']
                ? MODELS[K]['attributes'][ATTRIBUTE_KEY]['table'] extends MODELS[TARGET_MODEL_NAME]['table']
                  ? MODELS[K]
                  : ITypeError<`ref "${MODELS[K]['modelName'] & string}.${ATTRIBUTE_KEY}" target model must match models.${TARGET_MODEL_NAME}`>
                : ITypeError<`ref "${MODELS[K]['modelName'] & string}.${ATTRIBUTE_KEY}" target model must match models.${TARGET_MODEL_NAME}`>
              : ITypeError<`ref "${MODELS[K]['modelName'] & string}.${ATTRIBUTE_KEY}" target model "${MODELS[K]['attributes'][ATTRIBUTE_KEY]['targetTableName'] & string}" is not registered on controller models`>
            : MODELS[K];
        }[keyof MODELS[K]['attributes'] & string] extends infer RESULT
        ? Exclude<RESULT, MODELS[K]> extends never
          ? MODELS[K]
          : Exclude<RESULT, MODELS[K]>
        : never
      : ITypeError<`models key "${K}" must equal model.modelName "${MODELS[K]['modelName'] & string}"`>
    : ITypeError<`models key "${K}" must equal model.modelName "${MODELS[K]['modelName'] & string}"`>;
};

type IRelationRefSelector<
  MODEL extends IModel = IModel,
  OWN_REF extends string = string,
  CONNECTED_REF extends keyof MODEL['attributes'] & string =
    keyof MODEL['attributes'] & string,
> =
  | {
      ownRef: OWN_REF;
      connectedRef?: never;
    }
  | {
      ownRef?: never;
      connectedRef: CONNECTED_REF;
    };

export type IConnectOneRelation<
  MODEL extends IModel = IModel,
  OWN_REF extends string = string,
  CONNECTED_REF extends keyof MODEL['attributes'] & string =
    keyof MODEL['attributes'] & string,
> = {
  kind: 'one';
  model: MODEL;
} & IRelationRefSelector<MODEL, OWN_REF, CONNECTED_REF>;

export type IConnectManyRelation<
  MODEL extends IModel = IModel,
  OWN_REF extends string = string,
  CONNECTED_REF extends keyof MODEL['attributes'] & string =
    keyof MODEL['attributes'] & string,
> = {
  kind: 'many';
  model: MODEL;
} & IRelationRefSelector<MODEL, OWN_REF, CONNECTED_REF>;

export type IAnyConnectRelation = IConnectOneRelation | IConnectManyRelation;

export type IRelationsByModelKey<MODELS extends Record<string, IModel>> =
  Partial<
    Record<
      keyof MODELS & string,
      {
        [key: string]: IAnyConnectRelation;
      }
    >
  >;

export type IRelationHelpers = {
  connectOne: <
    MODEL extends IModel,
    OWN_REF extends string,
    CONNECTED_REF extends keyof MODEL['attributes'] & string,
  >(
    props: {
      model: MODEL;
    } & IRelationRefSelector<MODEL, OWN_REF, CONNECTED_REF>,
  ) => IConnectOneRelation<MODEL, OWN_REF, CONNECTED_REF>;
  connectMany: <
    MODEL extends IModel,
    OWN_REF extends string,
    CONNECTED_REF extends keyof MODEL['attributes'] & string,
  >(
    props: {
      model: MODEL;
    } & IRelationRefSelector<MODEL, OWN_REF, CONNECTED_REF>,
  ) => IConnectManyRelation<MODEL, OWN_REF, CONNECTED_REF>;
};

export type InferIdFromAbbreviation<ABBREVIATION extends string = string> =
  `${ABBREVIATION}_${string}`;

export type IStagedCursorId = InferIdFromAbbreviation<
  (typeof coreAbbreviations)['stagedCursor']
>;
export type IPushedCursorId = InferIdFromAbbreviation<
  (typeof coreAbbreviations)['pushedCursor']
>;

export type IAccountCursor = InferIdFromAbbreviation<
  (typeof coreAbbreviations)['accountCursor']
>;

export type IServiceCursorId = InferIdFromAbbreviation<
  (typeof coreAbbreviations)['serviceCursor']
>;
export type IActorId = InferIdFromAbbreviation<
  (typeof coreAbbreviations)['actor']
>;
export type IAccountId = InferIdFromAbbreviation<
  (typeof coreAbbreviations)['account']
>;

/** Alias for resource id string type (e.g. \`usr_xxx\`). */
export type IResourceIdString<ABBREVIATION extends string> =
  InferIdFromAbbreviation<ABBREVIATION>;

export type IRef = Readonly<{
  id: string;
  modelName: string;
}>;

assert<Equals<IRef['id'], string>>();

export type IAnyResource = IDecodedResource & {
  readonly [key: string]: IPrimitive;
};
