import type { AnyRelations, Many, One } from 'drizzle-orm';
import type {
  AnySQLiteSelect,
  BaseSQLiteDatabase,
} from 'drizzle-orm/sqlite-core';
import type * as V1 from 'drizzle-orm/sqlite-core/query-builders/_query';
import type { SQLiteSyncRelationalQuery } from 'drizzle-orm/sqlite-core/query-builders/query';
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core/session';
import type { Brand } from 'effect';
import type { UnionToIntersection } from 'type-fest';

import type {
  IAnyDrizzleSchemas,
  IAnyRefDescriptor,
  IAnyTables,
  IDrizzleSchema,
  IModels,
} from '../models/types.ts';

import type { makeInMemorySQLite3 } from './makeInMemorySQLite3.ts';

type IInMemoryWaSqliteClient = Awaited<ReturnType<typeof makeInMemorySQLite3>>;

export type IWaSqliteClient = Omit<IInMemoryWaSqliteClient, 'sqlite3'> & {
  sqlite3: Omit<
    IInMemoryWaSqliteClient['sqlite3'],
    'finalize' | 'statements' | 'step'
  > & {
    finalize(stmt: number): number;
    statements(
      db: number,
      sql: string,
      options?: { unscoped?: boolean },
    ): ReadonlyArray<number>;
    step(stmt: number): number;
  };
};

export type IWaSqliteRunResult = {
  changes: number;
};

type NonEmptyObject<T> = keyof T extends never ? never : T;

type ParentModelName<
  TABLES extends IAnyTables,
  PARENT_KEY extends keyof TABLES,
> = TABLES[PARENT_KEY]['name'];

type InverseRecordForSourceModel<
  TABLES extends IAnyTables,
  PARENT_KEY extends keyof TABLES & string,
  SOURCE_KEY extends keyof TABLES & string,
> =
  UnionToIntersection<
    {
      [PROPERTY in keyof TABLES[SOURCE_KEY]['shape']]: TABLES[SOURCE_KEY]['shape'][PROPERTY] extends infer REF extends
        IAnyRefDescriptor
        ? REF['targetTableName'] extends ParentModelName<TABLES, PARENT_KEY>
          ? Record<
              REF['inverse'],
              REF['unique'] extends true
                ? One<SOURCE_KEY, true>
                : Many<SOURCE_KEY>
            >
          : never
        : never;
    }[keyof TABLES[SOURCE_KEY]['shape']]
  > extends infer INTERSECTED_INVERSE_RELATIONS
    ? NonEmptyObject<INTERSECTED_INVERSE_RELATIONS>
    : never;

type SourceModelKeysWithRefTo<
  TABLES extends IAnyTables,
  PARENT_KEY extends keyof TABLES & string,
> = {
  [SOURCE_KEY in Exclude<keyof TABLES, PARENT_KEY>]: InverseRecordForSourceModel<
    TABLES,
    PARENT_KEY,
    Extract<SOURCE_KEY, keyof TABLES & string>
  > extends never
    ? never
    : SOURCE_KEY;
}[Exclude<keyof TABLES, PARENT_KEY>];

type InverseRelationsMapForParentModel<
  TABLES extends IAnyTables,
  PARENT_KEY extends keyof TABLES & string,
> = [SourceModelKeysWithRefTo<TABLES, PARENT_KEY>] extends [never]
  ? {}
  : UnionToIntersection<
      SourceModelKeysWithRefTo<TABLES, PARENT_KEY> extends infer SOURCE_KEY
        ? SOURCE_KEY extends keyof TABLES & string
          ? InverseRecordForSourceModel<TABLES, PARENT_KEY, SOURCE_KEY>
          : never
        : never
    >;

export type InferDrizzleSchemaFromTables<TABLES extends IAnyTables> = {
  [K in keyof TABLES]: IDrizzleSchema<
    Extract<TABLES[K]['name'], string>,
    TABLES[K]['shape']
  >;
};

export type IResourceDrizzleSchemasFromModels<MODELS extends IModels> = {
  [K in keyof MODELS]: IDrizzleSchema<
    MODELS[K]['table']['name'],
    MODELS[K]['table']['shape']
  >;
};

export type IFullDrizzleSchema<
  MODELS extends IModels,
  OTHER_TABLES extends IAnyTables,
> = IResourceDrizzleSchemasFromModels<MODELS> &
  InferDrizzleSchemaFromTables<OTHER_TABLES>;

export type IDrizzleRelationsFromModels<
  MODELS extends IModels,
  TABLES extends IAnyTables = {
    [MODEL_KEY in keyof MODELS]: MODELS[MODEL_KEY]['table'];
  },
> = {
  [TABLE_KEY in keyof TABLES & string]: {
    table: IDrizzleSchema<
      TABLES[TABLE_KEY]['name'],
      TABLES[TABLE_KEY]['shape']
    >;
    name: TABLE_KEY;
    relations: {
      [PROPERTY in keyof TABLES[TABLE_KEY]['shape'] as TABLES[TABLE_KEY]['shape'][PROPERTY] extends IAnyRefDescriptor
        ? TABLES[TABLE_KEY]['shape'][PROPERTY]['relation']
        : never]: TABLES[TABLE_KEY]['shape'][PROPERTY] extends infer REF extends
        IAnyRefDescriptor
        ? One<
            {
              [TARGET_TABLE_KEY in keyof TABLES & string]: TABLES[TARGET_TABLE_KEY]['name'] extends REF['targetTableName']
                ? TARGET_TABLE_KEY
                : never;
            }[keyof TABLES & string],
            REF['nullable']
          >
        : never;
    } & InverseRelationsMapForParentModel<TABLES, TABLE_KEY>;
  };
};

export type IDbConfig<
  SCHEMA extends IAnyDrizzleSchemas = IAnyDrizzleSchemas,
  RELATIONS extends AnyRelations = AnyRelations,
> = Readonly<{
  schema: SCHEMA;
  relations: RELATIONS;
}>;

export type IDbConfigSchema<CONFIG extends IDbConfig> = CONFIG['schema'];

export type IDbConfigRelations<CONFIG extends IDbConfig> = CONFIG['relations'];

export type IResourceDbConfig<
  MODELS extends IModels = IModels,
  OTHER_TABLES extends IAnyTables = IAnyTables,
> = IDbConfig<
  IFullDrizzleSchema<MODELS, OTHER_TABLES>,
  IDrizzleRelationsFromModels<MODELS>
> &
  Brand.Brand<'ResourceDbConfig'>;

export type ISyncSQLiteDatabase<
  SCHEMA extends IAnyDrizzleSchemas,
  RELATIONS extends AnyRelations,
> = BaseSQLiteDatabase<'sync', unknown, SCHEMA, RELATIONS>;

// TODO: Make an IAnyDbConfig
export type IDb<
  // oxlint-disable-next-line typescript/no-explicit-any -- erased repo DB handles need the historical widest Drizzle config default.
  CONFIG extends IDbConfig = IDbConfig<any, any>,
> = ISyncSQLiteDatabase<IDbConfigSchema<CONFIG>, IDbConfigRelations<CONFIG>>;

// TODO: Make an IAnyResourceDbConfig?
export type IResourceDb<
  // oxlint-disable-next-line typescript/no-explicit-any -- resource DB default must remain assignable from generically constructed Drizzle configs.
  CONFIG extends IResourceDbConfig = IResourceDbConfig<any, any>,
> = IDb<CONFIG> & Brand.Brand<'ResourceDb'>;

/** Branded `IDrizzleTransaction` — only produced inside an open `makeTx` transaction. */
type IDrizzleTransaction<CONFIG extends IDbConfig> = SQLiteTransaction<
  'sync',
  unknown,
  IDbConfigSchema<CONFIG>,
  IDbConfigRelations<CONFIG>
>;

// oxlint-disable-next-line typescript/no-explicit-any -- transaction defaults mirror IDb's erased Drizzle config surface.
export type ITx<CONFIG extends IDbConfig = IDbConfig<any, any>> =
  IDrizzleTransaction<CONFIG>;

// oxlint-disable-next-line typescript/no-explicit-any -- session DB defaults mirror IDb's erased Drizzle config surface.
export type IWaSqliteDrizzleDb<CONFIG extends IDbConfig = IDbConfig<any, any>> =
  IDb<CONFIG> & {
    $client: IWaSqliteClient;
  };

/** Relational/select queries `useLiveQuery` can run against a sync wa-sqlite Drizzle db. */
export type ILiveRelationalQuery =
  | AnySQLiteSelect
  // oxlint-disable-next-line typescript/no-explicit-any -- Drizzle relational query union erases row types
  | SQLiteSyncRelationalQuery<any>
  // oxlint-disable-next-line typescript/no-explicit-any -- Drizzle relational query union erases row types
  | V1.SQLiteSyncRelationalQuery<any>;
