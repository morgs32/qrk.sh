import * as V1 from 'drizzle-orm/_relations';
import { entityKind } from 'drizzle-orm/entity';
import { DefaultLogger, type Logger } from 'drizzle-orm/logger';
import type { AnyRelations, EmptyRelations } from 'drizzle-orm/relations';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core/db';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core/dialect';
import type { SQLiteSession } from 'drizzle-orm/sqlite-core/session';
import type { DrizzleConfig } from 'drizzle-orm/utils';

import type { IAnyDrizzleSchemas } from '../models/types.ts';

import type {
  IDbConfig,
  IDbConfigRelations,
  IDbConfigSchema,
  IWaSqliteClient,
  IWaSqliteDrizzleDb,
  IWaSqliteRunResult,
} from './types.ts';
import { WaSqliteSession } from './WaSqliteSession.ts';

export class WaSqliteDatabase<
  TSchema extends IAnyDrizzleSchemas = Record<string, never>,
  TRelations extends AnyRelations = EmptyRelations,
> extends BaseSQLiteDatabase<'sync', IWaSqliteRunResult, TSchema, TRelations> {
  static override readonly [entityKind]: string = 'WaSqliteDatabase';
}

export function makeWaSqliteDrizzle<CONFIG extends IDbConfig>(
  client: IWaSqliteClient,
  config: CONFIG &
    Omit<
      DrizzleConfig<IDbConfigSchema<CONFIG>, IDbConfigRelations<CONFIG>>,
      'schema' | 'relations'
    >,
): IWaSqliteDrizzleDb<CONFIG> &
  WaSqliteDatabase<IDbConfigSchema<CONFIG>, IDbConfigRelations<CONFIG>> & {
    $client: IWaSqliteClient;
  } {
  const dialect = new SQLiteSyncDialect(
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

  const database = new WaSqliteDatabase(
    'sync',
    dialect,
    new WaSqliteSession(
      client,
      dialect,
      relations,
      typedSchema,
      sessionOptions,
    ) as SQLiteSession<
      'sync',
      IWaSqliteRunResult,
      IDbConfigSchema<CONFIG>,
      IDbConfigRelations<CONFIG>,
      V1.ExtractTablesWithRelations<IDbConfigSchema<CONFIG>>
    >,
    relations,
    typedSchema,
    false,
    true,
  ) as WaSqliteDatabase<IDbConfigSchema<CONFIG>, IDbConfigRelations<CONFIG>> & {
    $client: IWaSqliteClient;
  };

  database.$client = client;
  return database;
}
