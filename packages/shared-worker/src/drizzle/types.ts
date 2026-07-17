import type {
  IDbConfig,
  IDbConfigRelations,
  IDbConfigSchema,
  IWaSqliteRunResult,
} from '@zerospin/core/drizzle/types';
import type { AnyRelations } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core/session';

import type { makeIdbSQLite3 } from './makeIdbSQLite3.ts';

export type IAsyncWaSqliteClient = Awaited<ReturnType<typeof makeIdbSQLite3>>;

export type IAsyncSQLiteDatabase<
  SCHEMA extends Record<string, unknown>,
  RELATIONS extends AnyRelations,
> = BaseSQLiteDatabase<'async', unknown, SCHEMA, RELATIONS>;

export type IAsyncDb<
  // oxlint-disable-next-line typescript/no-explicit-any -- erased async browser DB handles mirror Core IDb defaults.
  CONFIG extends IDbConfig = IDbConfig<any, any>,
> = IAsyncSQLiteDatabase<IDbConfigSchema<CONFIG>, IDbConfigRelations<CONFIG>>;

type IAsyncDrizzleTransaction<CONFIG extends IDbConfig> = SQLiteTransaction<
  'async',
  unknown,
  IDbConfigSchema<CONFIG>,
  IDbConfigRelations<CONFIG>
>;

// oxlint-disable-next-line typescript/no-explicit-any -- async transaction defaults mirror Core ITx's erased Drizzle config surface.
export type IAsyncTx<CONFIG extends IDbConfig = IDbConfig<any, any>> =
  IAsyncDrizzleTransaction<CONFIG>;

export type IAsyncWaSqliteDrizzleDb<
  // oxlint-disable-next-line typescript/no-explicit-any -- async browser DB defaults mirror Core IWaSqliteDrizzleDb's erased config surface.
  CONFIG extends IDbConfig = IDbConfig<any, any>,
> = IAsyncDb<CONFIG> & {
  $client: IAsyncWaSqliteClient;
};

export type {
  IDbConfig,
  IDbConfigRelations,
  IDbConfigSchema,
  IWaSqliteRunResult,
};
