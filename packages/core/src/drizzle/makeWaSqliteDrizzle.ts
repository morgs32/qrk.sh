import { entityKind } from 'drizzle-orm/entity';
import { DefaultLogger, type Logger } from 'drizzle-orm/logger';
import type { AnyRelations, EmptyRelations } from 'drizzle-orm/relations';
import { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core/async/db';
import { SQLiteDialect } from 'drizzle-orm/sqlite-core/dialect';
import type { DrizzleSQLiteConfig } from 'drizzle-orm/sqlite-core/utils';

import type {
  IDbConfig,
  IDbConfigRelations,
  IWaSqliteClient,
  IWaSqliteDrizzleDb,
  IWaSqliteRunResult,
} from './types.ts';
import { WaSqliteSession } from './WaSqliteSession.ts';

export class WaSqliteDatabase<
  TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteAsyncDatabase<'sync', IWaSqliteRunResult, TRelations> {
  static override readonly [entityKind]: string = 'WaSqliteDatabase';
}

export function makeWaSqliteDrizzle<CONFIG extends IDbConfig>(
  client: IWaSqliteClient,
  config: CONFIG &
    Omit<
      DrizzleSQLiteConfig<IDbConfigRelations<CONFIG>>,
      'relations'
    >,
): IWaSqliteDrizzleDb<CONFIG> &
  WaSqliteDatabase<IDbConfigRelations<CONFIG>> & {
    $client: IWaSqliteClient;
  } {
  client.sqlite3.exec(client.db, 'PRAGMA foreign_keys = ON;');

  const dialect = new SQLiteDialect();

  let logger: Logger | undefined;
  if (config.logger === true) {
    logger = new DefaultLogger();
  } else if (config.logger !== false) {
    logger = config.logger;
  }

  const sessionOptions = logger === undefined ? {} : { logger };
  const relations = config.relations;

  const database = new WaSqliteDatabase(
    'sync',
    dialect,
    new WaSqliteSession(client, dialect, relations, sessionOptions),
    relations,
    true,
  ) as WaSqliteDatabase<IDbConfigRelations<CONFIG>> & {
    $client: IWaSqliteClient;
  };

  database.$client = client;
  return database;
}
