import {
  type integer as drizzleInteger,
  type real as drizzleReal,
  type text as drizzleText,
} from 'drizzle-orm/sqlite-core';
import { type Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import type { IsUnion } from 'type-fest';

import type { ITypeError } from '../utils/types.ts';

import { PrimitiveKind } from './primitiveKind.ts';
import type {
  IAnyRefDescriptor,
  IAnyTable,
  IBooleanDescriptor,
  ICursorDescriptor,
  IDateDescriptor,
  IEnumDescriptor,
  IIntegerDescriptor,
  IJsonDescriptor,
  INumberDescriptor,
  IOpaqueIdDescriptor,
  IPrimaryKeyDescriptor,
  IRefDescriptor,
  ITextDescriptor,
} from './types.ts';

export type IDrizzleIntegerColumnBuilder = ReturnType<typeof drizzleInteger>;
export type IDrizzleTextColumnBuilder = ReturnType<typeof drizzleText>;
export type IDrizzleRealColumnBuilder = ReturnType<typeof drizzleReal>;
export type IDrizzleBooleanColumnBuilder = ReturnType<
  typeof drizzleInteger<'boolean'>
>;
export type IDrizzleTimestampColumnBuilder = ReturnType<
  typeof drizzleInteger<'timestamp'>
>;
export type IDrizzleEnumColumnBuilder<VALUES extends [string, ...string[]]> =
  ReturnType<typeof drizzleText<VALUES[number], VALUES, 'text'>>;

type InferDrizzleColumnBuilderRawData<T> = T extends {
  _: { $type: infer DATA };
}
  ? DATA
  : T extends { _: { data: infer DATA } }
    ? DATA
    : never;

type InferDrizzleColumnBuilderNotNull<T> = T extends {
  _: { notNull: infer NOT_NULL };
}
  ? NOT_NULL
  : false;

export type InferDrizzleColumnBuilderData<T> =
  | InferDrizzleColumnBuilderRawData<T>
  | (InferDrizzleColumnBuilderNotNull<T> extends true ? never : null);

type _EnumDecoded = InferDrizzleColumnBuilderData<
  IDrizzleEnumColumnBuilder<['a', 'b', 'c']>
>;
assert<Equals<_EnumDecoded, 'a' | 'b' | 'c' | null>>();

export type InferNullableDrizzleColumnBuilderData<T> = T extends {
  _: { notNull: true };
}
  ? InferDrizzleColumnBuilderData<T>
  : InferDrizzleColumnBuilderData<T> | null;

function primaryKey<const ABBREVIATION extends string>(props: {
  abbreviation: ABBREVIATION;
}): IPrimaryKeyDescriptor<ABBREVIATION> {
  const { abbreviation } = props;
  if (abbreviation === '') {
    throw new Error(
      'primitives.primaryKey requires a non-empty `abbreviation`',
    );
  }
  return {
    kind: PrimitiveKind.PrimaryKey,
    nullable: false,
    unique: true,
    abbreviation,
  };
}

function boolean<const DEFAULT_VALUE extends boolean>(props: {
  nullable: true;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): IBooleanDescriptor<true, DEFAULT_VALUE>;
function boolean(props: {
  nullable: true;
  unique?: boolean;
  defaultValue?: undefined;
}): IBooleanDescriptor<true, undefined>;
function boolean<const DEFAULT_VALUE extends boolean>(props: {
  nullable?: false | undefined;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): IBooleanDescriptor<false, DEFAULT_VALUE>;
function boolean(props?: {
  nullable?: false | undefined;
  unique?: boolean;
  defaultValue?: undefined;
}): IBooleanDescriptor<false, undefined>;
function boolean<
  NULLABLE extends boolean,
  const DEFAULT_VALUE extends boolean,
>(props: {
  nullable?: NULLABLE;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): IBooleanDescriptor<NULLABLE, DEFAULT_VALUE>;
function boolean<NULLABLE extends boolean = false>(props?: {
  nullable?: NULLABLE;
  unique?: boolean;
  defaultValue?: undefined;
}): IBooleanDescriptor<NULLABLE, undefined>;
function boolean(props?: {
  nullable?: boolean | undefined;
  unique?: boolean | undefined;
  defaultValue?: boolean | undefined;
}): IBooleanDescriptor<boolean, boolean | undefined> {
  const { nullable = false, unique = false, defaultValue } = props ?? {};
  if (defaultValue === undefined) {
    return {
      kind: PrimitiveKind.Boolean,
      nullable,
      unique,
    };
  }
  return {
    kind: PrimitiveKind.Boolean,
    nullable,
    unique,
    defaultValue,
  };
}

function integer<const DEFAULT_VALUE extends number>(props: {
  nullable: true;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): IIntegerDescriptor<true, DEFAULT_VALUE>;
function integer(props: {
  nullable: true;
  unique?: boolean;
  defaultValue?: undefined;
}): IIntegerDescriptor<true, undefined>;
function integer<const DEFAULT_VALUE extends number>(props: {
  nullable?: false | undefined;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): IIntegerDescriptor<false, DEFAULT_VALUE>;
function integer(props?: {
  nullable?: false | undefined;
  unique?: boolean;
  defaultValue?: undefined;
}): IIntegerDescriptor<false, undefined>;
function integer<
  NULLABLE extends boolean,
  const DEFAULT_VALUE extends number,
>(props: {
  nullable?: NULLABLE;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): IIntegerDescriptor<NULLABLE, DEFAULT_VALUE>;
function integer<NULLABLE extends boolean = false>(props?: {
  nullable?: NULLABLE;
  unique?: boolean;
  defaultValue?: undefined;
}): IIntegerDescriptor<NULLABLE, undefined>;
function integer(props?: {
  nullable?: boolean | undefined;
  unique?: boolean | undefined;
  defaultValue?: number | undefined;
}): IIntegerDescriptor<boolean, number | undefined> {
  const { nullable = false, unique = false, defaultValue } = props ?? {};
  if (defaultValue === undefined) {
    return {
      kind: PrimitiveKind.Integer,
      nullable,
      unique,
    };
  }
  return {
    kind: PrimitiveKind.Integer,
    nullable,
    unique,
    defaultValue,
  };
}

function number<const DEFAULT_VALUE extends number>(props: {
  nullable: true;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): INumberDescriptor<true, DEFAULT_VALUE>;
function number(props: {
  nullable: true;
  unique?: boolean;
  defaultValue?: undefined;
}): INumberDescriptor<true, undefined>;
function number<const DEFAULT_VALUE extends number>(props: {
  nullable?: false | undefined;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): INumberDescriptor<false, DEFAULT_VALUE>;
function number(props?: {
  nullable?: false | undefined;
  unique?: boolean;
  defaultValue?: undefined;
}): INumberDescriptor<false, undefined>;
function number<
  NULLABLE extends boolean,
  const DEFAULT_VALUE extends number,
>(props: {
  nullable?: NULLABLE;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): INumberDescriptor<NULLABLE, DEFAULT_VALUE>;
function number<NULLABLE extends boolean = false>(props?: {
  nullable?: NULLABLE;
  unique?: boolean;
  defaultValue?: undefined;
}): INumberDescriptor<NULLABLE, undefined>;
function number(props?: {
  nullable?: boolean | undefined;
  unique?: boolean | undefined;
  defaultValue?: number | undefined;
}): INumberDescriptor<boolean, number | undefined> {
  const { nullable = false, unique = false, defaultValue } = props ?? {};
  if (defaultValue === undefined) {
    return {
      kind: PrimitiveKind.Number,
      nullable,
      unique,
    };
  }
  return {
    kind: PrimitiveKind.Number,
    nullable,
    unique,
    defaultValue,
  };
}

function text<const DEFAULT_VALUE extends string>(props: {
  nullable: true;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): ITextDescriptor<true, DEFAULT_VALUE>;
function text(props: {
  nullable: true;
  unique?: boolean;
  defaultValue?: undefined;
}): ITextDescriptor<true, undefined>;
function text<const DEFAULT_VALUE extends string>(props: {
  nullable?: false | undefined;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): ITextDescriptor<false, DEFAULT_VALUE>;
function text(props?: {
  nullable?: false | undefined;
  unique?: boolean;
  defaultValue?: undefined;
}): ITextDescriptor<false, undefined>;
function text<
  NULLABLE extends boolean,
  const DEFAULT_VALUE extends string,
>(props: {
  nullable?: NULLABLE;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): ITextDescriptor<NULLABLE, DEFAULT_VALUE>;
function text<NULLABLE extends boolean = false>(props?: {
  nullable?: NULLABLE;
  unique?: boolean;
  defaultValue?: undefined;
}): ITextDescriptor<NULLABLE, undefined>;
function text(props?: {
  nullable?: boolean | undefined;
  unique?: boolean | undefined;
  defaultValue?: string | undefined;
}): ITextDescriptor<boolean, string | undefined> {
  const { nullable = false, unique = false, defaultValue } = props ?? {};
  if (defaultValue === undefined) {
    return {
      kind: PrimitiveKind.Text,
      nullable,
      unique,
    };
  }
  return {
    kind: PrimitiveKind.Text,
    nullable,
    unique,
    defaultValue,
  };
}

function cursor<const ABBREVIATION extends string>(props: {
  abbreviation: ABBREVIATION;
  nullable: true;
  unique?: boolean;
}): ICursorDescriptor<true, ABBREVIATION>;
function cursor<const ABBREVIATION extends string>(props: {
  abbreviation: ABBREVIATION;
  nullable?: false | undefined;
  unique?: boolean;
}): ICursorDescriptor<false, ABBREVIATION>;
function cursor(props: {
  abbreviation: string;
  nullable?: boolean | undefined;
  unique?: boolean | undefined;
}): ICursorDescriptor<boolean, string> {
  const { abbreviation, nullable = false, unique = false } = props;
  if (abbreviation === '') {
    throw new Error('primitives.cursor requires a non-empty `abbreviation`');
  }
  return {
    kind: PrimitiveKind.Cursor,
    nullable,
    unique,
    abbreviation,
  };
}

function opaqueId<const ABBREVIATION extends string>(props: {
  abbreviation: ABBREVIATION;
  nullable: true;
  unique?: boolean;
}): IOpaqueIdDescriptor<true, ABBREVIATION>;
function opaqueId<const ABBREVIATION extends string>(props: {
  abbreviation: ABBREVIATION;
  nullable?: false | undefined;
  unique?: boolean;
}): IOpaqueIdDescriptor<false, ABBREVIATION>;
function opaqueId(props: {
  abbreviation: string;
  nullable?: boolean | undefined;
  unique?: boolean | undefined;
}): IOpaqueIdDescriptor<boolean, string> {
  const { abbreviation, nullable = false, unique = false } = props;
  if (abbreviation === '') {
    throw new Error('primitives.opaqueId requires a non-empty `abbreviation`');
  }
  return {
    kind: PrimitiveKind.OpaqueId,
    nullable,
    unique,
    abbreviation,
  };
}

function json<DATA>(props: {
  schema: Schema.Schema<DATA, Schema.Schema.Encoded<Schema.Schema.Any>>;
  nullable: true;
  defaultValue: null;
}): IJsonDescriptor<true, DATA | null, null>;
function json<DATA>(props: {
  schema: Schema.Schema<DATA, Schema.Schema.Encoded<Schema.Schema.Any>>;
  nullable: true;
  defaultValue?: undefined;
}): IJsonDescriptor<true, DATA | null, undefined>;
function json<DATA>(props: {
  schema: Schema.Schema<DATA, Schema.Schema.Encoded<Schema.Schema.Any>>;
  nullable?: false | undefined;
  defaultValue?: undefined;
}): IJsonDescriptor<false, DATA, undefined>;
function json<DATA, NULLABLE extends boolean = false>(props: {
  schema: Schema.Schema<DATA, Schema.Schema.Encoded<Schema.Schema.Any>>;
  nullable?: NULLABLE;
  defaultValue?: NULLABLE extends true ? null | undefined : undefined;
}): IJsonDescriptor<
  NULLABLE,
  NULLABLE extends true ? DATA | null : DATA,
  NULLABLE extends true ? null | undefined : undefined
> {
  if (props.nullable === true) {
    if (props.defaultValue === null) {
      return {
        kind: PrimitiveKind.Json,
        nullable: true,
        schema: props.schema,
        defaultValue: null,
      } as IJsonDescriptor<
        NULLABLE,
        NULLABLE extends true ? DATA | null : DATA,
        NULLABLE extends true ? null | undefined : undefined
      >;
    }
    return {
      kind: PrimitiveKind.Json,
      nullable: true,
      schema: props.schema,
    } as IJsonDescriptor<
      NULLABLE,
      NULLABLE extends true ? DATA | null : DATA,
      NULLABLE extends true ? null | undefined : undefined
    >;
  }
  return {
    kind: PrimitiveKind.Json,
    nullable: false,
    schema: props.schema,
  } as IJsonDescriptor<
    NULLABLE,
    NULLABLE extends true ? DATA | null : DATA,
    NULLABLE extends true ? null | undefined : undefined
  >;
}

function date<DEFAULT_VALUE extends Date>(props: {
  nullable: true;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): IDateDescriptor<true, DEFAULT_VALUE>;
function date(props: {
  nullable: true;
  unique?: boolean;
  defaultValue?: undefined;
}): IDateDescriptor<true, undefined>;
function date<DEFAULT_VALUE extends Date>(props: {
  nullable?: false | undefined;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): IDateDescriptor<false, DEFAULT_VALUE>;
function date(props?: {
  nullable?: false | undefined;
  unique?: boolean;
  defaultValue?: undefined;
}): IDateDescriptor<false, undefined>;
function date<NULLABLE extends boolean, DEFAULT_VALUE extends Date>(props: {
  nullable?: NULLABLE;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): IDateDescriptor<NULLABLE, DEFAULT_VALUE>;
function date<NULLABLE extends boolean = false>(props?: {
  nullable?: NULLABLE;
  unique?: boolean;
  defaultValue?: undefined;
}): IDateDescriptor<NULLABLE, undefined>;
function date(props?: {
  nullable?: boolean | undefined;
  unique?: boolean | undefined;
  defaultValue?: Date | undefined;
}): IDateDescriptor<boolean, Date | undefined> {
  const { nullable = false, unique = false, defaultValue } = props ?? {};
  if (defaultValue === undefined) {
    return {
      kind: PrimitiveKind.Date,
      nullable,
      unique,
    };
  }
  return {
    kind: PrimitiveKind.Date,
    nullable,
    unique,
    defaultValue,
  };
}

function enum_<
  const VALUES extends readonly [string, ...string[]],
  const DEFAULT_VALUE extends VALUES[number],
>(props: {
  values: VALUES;
  nullable: true;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): IEnumDescriptor<true, VALUES, DEFAULT_VALUE>;
function enum_<const VALUES extends readonly [string, ...string[]]>(props: {
  values: VALUES;
  nullable: true;
  unique?: boolean;
  defaultValue?: undefined;
}): IEnumDescriptor<true, VALUES, undefined>;
function enum_<
  const VALUES extends readonly [string, ...string[]],
  const DEFAULT_VALUE extends VALUES[number],
>(props: {
  values: VALUES;
  nullable?: false | undefined;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): IEnumDescriptor<false, VALUES, DEFAULT_VALUE>;
function enum_<const VALUES extends readonly [string, ...string[]]>(props: {
  values: VALUES;
  nullable?: false | undefined;
  unique?: boolean;
  defaultValue?: undefined;
}): IEnumDescriptor<false, VALUES, undefined>;
function enum_<
  const VALUES extends readonly [string, ...string[]],
  NULLABLE extends boolean,
  const DEFAULT_VALUE extends VALUES[number],
>(props: {
  values: VALUES;
  nullable?: NULLABLE;
  unique?: boolean;
  defaultValue: DEFAULT_VALUE;
}): IEnumDescriptor<NULLABLE, VALUES, DEFAULT_VALUE>;
function enum_<
  const VALUES extends readonly [string, ...string[]],
  NULLABLE extends boolean = false,
>(props: {
  values: VALUES;
  nullable?: NULLABLE;
  unique?: boolean;
  defaultValue?: undefined;
}): IEnumDescriptor<NULLABLE, VALUES, undefined>;
function enum_<const VALUES extends readonly [string, ...string[]]>(props: {
  values: VALUES;
  nullable?: boolean | undefined;
  unique?: boolean | undefined;
  defaultValue?: VALUES[number] | undefined;
}): IEnumDescriptor<boolean, VALUES, VALUES[number] | undefined> {
  const { values, nullable = false, unique = false, defaultValue } = props;
  if (defaultValue === undefined) {
    return {
      kind: PrimitiveKind.Enum,
      values,
      nullable,
      unique,
    };
  }
  return {
    kind: PrimitiveKind.Enum,
    values,
    nullable,
    unique,
    defaultValue,
  };
}

function ref<
  const TABLE extends IAnyTable,
  const RELATION extends string,
  const INVERSE extends string,
  const NULLABLE extends boolean = false,
  const UNIQUE extends boolean = false,
>(props: {
  nullable?: NULLABLE;
  unique?: UNIQUE;
  table: TABLE &
    ([{
      [KEY in keyof TABLE['shape'] & string]: TABLE['shape'][KEY] extends IPrimaryKeyDescriptor
        ? KEY
        : never;
    }[keyof TABLE['shape'] & string]] extends [never]
      ? ITypeError<`primitives.ref target table "${TABLE['name']}" must have one primary key`>
      : IsUnion<
            {
              [KEY in keyof TABLE['shape'] & string]: TABLE['shape'][KEY] extends IPrimaryKeyDescriptor
                ? KEY
                : never;
            }[keyof TABLE['shape'] & string]
          > extends true
        ? ITypeError<`primitives.ref target table "${TABLE['name']}" must have only one primary key`>
        : unknown);
  relation: RELATION &
    (RELATION extends ''
      ? ITypeError<'primitives.ref relation must be non-empty'>
      : unknown);
  inverse: INVERSE &
    (INVERSE extends ''
      ? ITypeError<'primitives.ref inverse must be non-empty'>
      : unknown);
}): IRefDescriptor<
  NULLABLE,
  TABLE['shape'][{
    [KEY in keyof TABLE['shape'] & string]: TABLE['shape'][KEY] extends IPrimaryKeyDescriptor
      ? KEY
      : never;
  }[keyof TABLE['shape'] & string]] extends IPrimaryKeyDescriptor<
    infer ABBREVIATION
  >
    ? ABBREVIATION
    : string,
  TABLE,
  {
    [KEY in keyof TABLE['shape'] & string]: TABLE['shape'][KEY] extends IPrimaryKeyDescriptor
      ? KEY
      : never;
  }[keyof TABLE['shape'] & string],
  RELATION,
  INVERSE,
  UNIQUE
>;
function ref(props: {
  nullable?: boolean | undefined;
  unique?: boolean | undefined;
  table: IAnyTable;
  relation: string;
  inverse: string;
}): IAnyRefDescriptor {
  const { table, relation, inverse, nullable = false, unique = false } = props;
  if (relation === '') {
    throw new Error('primitives.ref requires a non-empty `relation`');
  }
  if (inverse === '') {
    throw new Error('primitives.ref requires a non-empty `inverse`');
  }

  let targetColumnName: string | undefined;
  let targetPrimaryKey: IPrimaryKeyDescriptor | undefined;

  // Step 1: inspect every target column so erased table inputs receive the same
  // sole-primary-key validation as typed calls.
  for (const [columnName, descriptor] of Object.entries(table.shape)) {
    if (descriptor.kind !== PrimitiveKind.PrimaryKey) {
      continue;
    }
    if (targetPrimaryKey !== undefined) {
      throw new Error(
        `primitives.ref target table "${table.name}" must have only one primary key`,
      );
    }
    targetColumnName = columnName;
    targetPrimaryKey = descriptor;
  }

  if (targetColumnName === undefined || targetPrimaryKey === undefined) {
    throw new Error(
      `primitives.ref target table "${table.name}" must have one primary key`,
    );
  }

  return {
    kind: PrimitiveKind.Ref,
    nullable,
    unique,
    abbreviation: targetPrimaryKey.abbreviation,
    table,
    targetTableName: table.name,
    targetColumnName,
    relation,
    inverse,
  };
}

function self<
  const RELATION extends string,
  const INVERSE extends string,
  const UNIQUE extends boolean = false,
>(props: {
  nullable: true;
  unique?: UNIQUE;
  relation: RELATION;
  inverse: INVERSE;
}): IAnyRefDescriptor & {
  nullable: true;
  unique: UNIQUE;
  relation: RELATION;
  inverse: INVERSE;
  self: true;
};
function self<
  const RELATION extends string,
  const INVERSE extends string,
  const UNIQUE extends boolean = false,
>(props: {
  nullable?: false | undefined;
  unique?: UNIQUE;
  relation: RELATION;
  inverse: INVERSE;
}): IAnyRefDescriptor & {
  nullable: false;
  unique: UNIQUE;
  relation: RELATION;
  inverse: INVERSE;
  self: true;
};
function self(props: {
  nullable?: boolean | undefined;
  unique?: boolean | undefined;
  relation: string;
  inverse: string;
}): IAnyRefDescriptor & { self: true } {
  const { nullable = false, unique = false, relation, inverse } = props;
  if (relation === '') {
    throw new Error('primitives.self requires a non-empty `relation`');
  }
  if (inverse === '') {
    throw new Error('primitives.self requires a non-empty `inverse`');
  }

  return {
    kind: PrimitiveKind.Ref,
    nullable,
    unique,
    abbreviation: '',
    table: {
      name: '',
      shape: {},
      indexes: [],
    },
    targetTableName: '',
    targetColumnName: '',
    relation,
    inverse,
    self: true,
  };
}

export const primitives = {
  primaryKey,
  boolean,
  cursor,
  opaqueId,
  integer,
  number,
  text,
  json,
  date,
  enum: enum_,
  ref,
  self,
};
