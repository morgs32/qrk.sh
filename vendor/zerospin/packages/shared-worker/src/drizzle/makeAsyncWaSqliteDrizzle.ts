import type { IAnyDrizzleSchemas } from '@zerospin/core/models/types';
import * as V1 from 'drizzle-orm/_relations';
import { entityKind } from 'drizzle-orm/entity';
import { DefaultLogger, type Logger } from 'drizzle-orm/logger';
import type { AnyRelations, EmptyRelations } from 'drizzle-orm/relations';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core/db';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core/dialect';
import type { SQLiteSession } from 'drizzle-orm/sqlite-core/session';
import type { DrizzleConfig } from 'drizzle-orm/utils';

import type {
  IAsyncWaSqliteClient,
  IAsyncWaSqliteDrizzleDb,
  IDbConfig,
  IDbConfigRelations,
  IDbConfigSchema,
  IWaSqliteRunResult,
} from './types.ts';
import { WaSqliteAsyncSession } from './WaSqliteAsyncSession.ts';

export class AsyncWaSqliteDatabase<
  TSchema extends IAnyDrizzleSchemas = Record<string, never>,
  TRelations extends AnyRelations = EmptyRelations,
> extends BaseSQLiteDatabase<'async', IWaSqliteRunResult, TSchema, TRelations> {
  static override readonly [entityKind]: string = 'AsyncWaSqliteDatabase';
}

export function makeAsyncWaSqliteDrizzle<CONFIG extends IDbConfig>(
  client: IAsyncWaSqliteClient,
  config: CONFIG &
    Omit<
      DrizzleConfig<IDbConfigSchema<CONFIG>, IDbConfigRelations<CONFIG>>,
      'schema' | 'relations'
    >,
): IAsyncWaSqliteDrizzleDb<CONFIG> &
  AsyncWaSqliteDatabase<IDbConfigSchema<CONFIG>, IDbConfigRelations<CONFIG>> & {
    $client: IAsyncWaSqliteClient;
  } {
  const dialect = new SQLiteAsyncDialect(
    config.casing === undefined ? {} : { casing: config.casing },
  );

  let logger: Logger | undefined;
  if (config.logger === true) {
    logger = new DefaultLogger();
  } else if (config.logger !== false) {
    logger = config.logger;
  }

  let schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined;

  if (config.schema) {
    const tablesConfig = V1.extractTablesRelationalConfig(
      config.schema,
      V1.createTableRelationsHelpers,
    );
    schema = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap,
    };
  }

  const sessionOptions = logger === undefined ? {} : { logger };
  const relations = config.relations;
  const typedSchema = schema as V1.RelationalSchemaConfig<
    V1.ExtractTablesWithRelations<IDbConfigSchema<CONFIG>>
  >;

  const database = new AsyncWaSqliteDatabase(
    'async',
    dialect,
    new WaSqliteAsyncSession(
      client,
      dialect,
      relations,
      typedSchema,
      sessionOptions,
    ) as SQLiteSession<
      'async',
      IWaSqliteRunResult,
      IDbConfigSchema<CONFIG>,
      IDbConfigRelations<CONFIG>,
      V1.ExtractTablesWithRelations<IDbConfigSchema<CONFIG>>
    >,
    relations,
    typedSchema,
    false,
    true,
  ) as AsyncWaSqliteDatabase<
    IDbConfigSchema<CONFIG>,
    IDbConfigRelations<CONFIG>
  > & {
    $client: IAsyncWaSqliteClient;
  };

  database.$client = client;
  return database;
}
