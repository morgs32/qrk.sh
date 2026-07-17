import type { IAnyDrizzleSchemas } from '@zerospin/core/models/types';
import { Column, getTableName, is, SQL, Subquery } from 'drizzle-orm';
import type * as V1 from 'drizzle-orm/_relations';
import { entityKind } from 'drizzle-orm/entity';
import { NoopLogger, type Logger } from 'drizzle-orm/logger';
import type { AnyRelations } from 'drizzle-orm/relations';
import { fillPlaceholders, sql, type Query } from 'drizzle-orm/sql/sql';
import type { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core/dialect';
import type { SelectedFieldsOrdered } from 'drizzle-orm/sqlite-core/query-builders/select.types';
import {
  SQLitePreparedQuery,
  SQLiteSession,
  SQLiteTransaction,
  type PreparedQueryConfig as PreparedQueryConfigBase,
  type SQLiteExecuteMethod,
  type SQLiteTransactionConfig,
} from 'drizzle-orm/sqlite-core/session';
import * as SQLite from 'wa-sqlite';

import type { IAsyncWaSqliteClient, IWaSqliteRunResult } from './types.ts';

type IWaSqliteAsyncSessionOptions = {
  logger?: Logger;
};

type IPreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

type IExecuteRowsProps = {
  client: IAsyncWaSqliteClient;
  parameters: ReadonlyArray<unknown>;
  sql: string;
};

type ISqliteStatementParameter =
  | number
  | string
  | Uint8Array
  | Array<number>
  | bigint
  | null;

function toSqliteStatementParameter(
  parameter: unknown,
): ISqliteStatementParameter {
  if (parameter === null) {
    return parameter;
  }
  if (typeof parameter === 'number') {
    return parameter;
  }
  if (typeof parameter === 'string') {
    return parameter;
  }
  if (typeof parameter === 'bigint') {
    return parameter;
  }
  if (parameter instanceof Uint8Array) {
    return parameter;
  }
  if (
    Array.isArray(parameter) &&
    parameter.every(item => typeof item === 'number')
  ) {
    return parameter;
  }
  if (parameter instanceof Date) {
    return parameter.getTime();
  }
  throw new Error(`Unsupported sqlite parameter type: ${typeof parameter}`);
}

async function executeValuesRows(
  props: IExecuteRowsProps,
): Promise<unknown[][]> {
  const { client, sql: querySql, parameters } = props;
  const { sqlite3, db } = client;
  const boundParameters = parameters.map(parameter =>
    toSqliteStatementParameter(parameter),
  );
  const rows: unknown[][] = [];

  for await (const statement of sqlite3.statements(db, querySql, {
    unscoped: true,
  })) {
    try {
      if (boundParameters.length > 0) {
        sqlite3.bind_collection(statement, boundParameters);
      }

      let stepResult = await sqlite3.step(statement);
      while (stepResult === SQLite.SQLITE_ROW) {
        rows.push(sqlite3.row(statement));
        stepResult = await sqlite3.step(statement);
      }
    } finally {
      await sqlite3.finalize(statement);
    }
  }

  return rows;
}

async function executeObjectRows(
  props: IExecuteRowsProps,
): Promise<Record<string, unknown>[]> {
  const { client, sql: querySql, parameters } = props;
  const { sqlite3, db } = client;
  const boundParameters = parameters.map(parameter =>
    toSqliteStatementParameter(parameter),
  );
  const rows: Record<string, unknown>[] = [];

  for await (const statement of sqlite3.statements(db, querySql, {
    unscoped: true,
  })) {
    try {
      if (boundParameters.length > 0) {
        sqlite3.bind_collection(statement, boundParameters);
      }

      const columnNames = sqlite3.column_names(statement);
      let stepResult = await sqlite3.step(statement);
      while (stepResult === SQLite.SQLITE_ROW) {
        const columnValues = sqlite3.row(statement);
        const row: Record<string, unknown> = {};

        for (
          let columnIndex = 0;
          columnIndex < columnNames.length;
          columnIndex++
        ) {
          const columnName = columnNames[columnIndex];
          if (columnName !== undefined) {
            row[columnName] = columnValues[columnIndex];
          }
        }

        rows.push(row);
        stepResult = await sqlite3.step(statement);
      }
    } finally {
      await sqlite3.finalize(statement);
    }
  }

  return rows;
}

function mapSelectedRow(
  fields: SelectedFieldsOrdered,
  row: unknown[],
  joinsNotNullableMap: Record<string, boolean> | undefined,
): Record<string, unknown> {
  const nullifyMap: Record<string, false | string> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle internal types lack proper definitions
  const result = fields.reduce<Record<string, any>>(
    (resultRecord, { path, field }, columnIndex) => {
      let decoder;
      if (is(field, Column)) {
        decoder = field;
      } else if (is(field, SQL)) {
        decoder = (field as any).decoder; // eslint-disable-line @typescript-eslint/no-explicit-any
      } else if (is(field, Subquery)) {
        decoder = (field as any)._.sql.decoder; // eslint-disable-line @typescript-eslint/no-explicit-any
      } else {
        decoder = (field as any).sql.decoder; // eslint-disable-line @typescript-eslint/no-explicit-any
      }

      let node = resultRecord;
      for (const [pathChunkIndex, pathChunk] of path.entries()) {
        if (pathChunkIndex < path.length - 1) {
          if (!(pathChunk in node)) {
            node[pathChunk] = {};
          }
          node = node[pathChunk];
          continue;
        }

        const rawValue = row[columnIndex];
        const value =
          rawValue === null ? null : decoder.mapFromDriverValue(rawValue);
        node[pathChunk] = value;

        if (joinsNotNullableMap && is(field, Column) && path.length === 2) {
          const objectName = path[0];
          if (!objectName) {
            return resultRecord;
          }
          const tableName = getTableName((field as any).table); // eslint-disable-line @typescript-eslint/no-explicit-any
          if (!(objectName in nullifyMap)) {
            nullifyMap[objectName] = value === null ? tableName : false;
          } else if (
            typeof nullifyMap[objectName] === 'string' &&
            nullifyMap[objectName] !== tableName
          ) {
            nullifyMap[objectName] = false;
          }
        }
      }

      return resultRecord;
    },
    {},
  );

  if (joinsNotNullableMap && Object.keys(nullifyMap).length > 0) {
    for (const [objectName, tableName] of Object.entries(nullifyMap)) {
      if (typeof tableName === 'string' && !joinsNotNullableMap[tableName]) {
        result[objectName] = null;
      }
    }
  }

  return result;
}

export class WaSqliteAsyncSession<
  TFullSchema extends IAnyDrizzleSchemas,
  TRelations extends AnyRelations,
  TSchema extends V1.TablesRelationalConfig,
> extends SQLiteSession<
  'async',
  IWaSqliteRunResult,
  TFullSchema,
  TRelations,
  TSchema
> {
  static override readonly [entityKind]: string = 'WaSqliteAsyncSession';

  private readonly logger: Logger;
  private readonly sessionDialect: SQLiteAsyncDialect;

  constructor(
    private readonly client: IAsyncWaSqliteClient,
    dialect: SQLiteAsyncDialect,
    private readonly relations: TRelations,
    private readonly schema: V1.RelationalSchemaConfig<TSchema> | undefined,
    options: IWaSqliteAsyncSessionOptions = {},
  ) {
    super(dialect);
    this.logger = options.logger ?? new NoopLogger();
    this.sessionDialect = dialect;
  }

  override prepareQuery<T extends Omit<IPreparedQueryConfig, 'run'>>(
    query: Query,
    fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    isResponseInArrayMode: boolean,
    customResultMapper?: (rows: unknown[][]) => unknown,
  ): WaSqliteAsyncPreparedQuery<T> {
    return new WaSqliteAsyncPreparedQuery(
      this.client,
      query,
      this.logger,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper as
        | ((rows: unknown[][] | Record<string, unknown>[]) => unknown)
        | undefined,
    );
  }

  override prepareRelationalQuery<T extends Omit<IPreparedQueryConfig, 'run'>>(
    query: Query,
    fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    customResultMapper: (rows: Record<string, unknown>[]) => unknown,
  ): WaSqliteAsyncPreparedQuery<T, true> {
    return new WaSqliteAsyncPreparedQuery(
      this.client,
      query,
      this.logger,
      fields,
      executeMethod,
      false,
      customResultMapper as
        | ((rows: unknown[][] | Record<string, unknown>[]) => unknown)
        | undefined,
      true,
    );
  }

  override async transaction<T>(
    transaction: (
      tx: SQLiteTransaction<
        'async',
        IWaSqliteRunResult,
        TFullSchema,
        TRelations,
        TSchema
      >,
    ) => Promise<T>,
    config: SQLiteTransactionConfig = {},
  ): Promise<T> {
    const tx = new WaSqliteAsyncTransaction(
      'async',
      this.sessionDialect,
      this,
      this.relations,
      this.schema,
      undefined,
      false,
      true,
    );
    await this.run(
      sql.raw(`begin${config.behavior ? ` ${config.behavior}` : ''}`),
    );

    let isCommitted = false;
    try {
      const result = await transaction(tx);
      await this.run(sql`commit`);
      isCommitted = true;
      return result;
    } finally {
      if (!isCommitted) {
        await this.run(sql`rollback`);
      }
    }
  }
}

export class WaSqliteAsyncTransaction<
  TFullSchema extends IAnyDrizzleSchemas,
  TRelations extends AnyRelations,
  TSchema extends V1.TablesRelationalConfig,
> extends SQLiteTransaction<
  'async',
  IWaSqliteRunResult,
  TFullSchema,
  TRelations,
  TSchema
> {
  static override readonly [entityKind]: string = 'WaSqliteAsyncTransaction';

  constructor(
    resultType: 'async',
    dialect: SQLiteAsyncDialect,
    session: SQLiteSession<
      'async',
      IWaSqliteRunResult,
      TFullSchema,
      TRelations,
      TSchema
    >,
    relations: TRelations,
    schema: V1.RelationalSchemaConfig<TSchema> | undefined,
    nestedIndex?: number,
    rowModeRqb?: boolean,
    forbidJsonb?: boolean,
  ) {
    super(
      resultType,
      dialect,
      session,
      relations,
      schema,
      nestedIndex,
      rowModeRqb,
      forbidJsonb,
    );
    this.transactionDialect = dialect;
    this.transactionSession = session;
  }

  private readonly transactionDialect: SQLiteAsyncDialect;
  private readonly transactionSession: SQLiteSession<
    'async',
    IWaSqliteRunResult,
    TFullSchema,
    TRelations,
    TSchema
  >;

  override async transaction<T>(
    transaction: (
      tx: SQLiteTransaction<
        'async',
        IWaSqliteRunResult,
        TFullSchema,
        TRelations,
        TSchema
      >,
    ) => Promise<T>,
  ): Promise<T> {
    const savepointName = `sp${this.nestedIndex + 1}`;
    const tx = new WaSqliteAsyncTransaction(
      'async',
      this.transactionDialect,
      this.transactionSession,
      this.relations,
      this.schema,
      this.nestedIndex + 1,
      false,
      true,
    );

    await tx.run(sql.raw(`savepoint ${savepointName}`));

    let isReleased = false;
    try {
      const result = await transaction(tx);
      await tx.run(sql.raw(`release savepoint ${savepointName}`));
      isReleased = true;
      return result;
    } finally {
      if (!isReleased) {
        await tx.run(sql.raw(`rollback to savepoint ${savepointName}`));
      }
    }
  }
}

export class WaSqliteAsyncPreparedQuery<
  T extends IPreparedQueryConfig = IPreparedQueryConfig,
  TIsRqbV2 extends boolean = false,
> extends SQLitePreparedQuery<{
  type: 'async';
  run: IWaSqliteRunResult;
  all: T['all'];
  get: T['get'];
  values: T['values'];
  execute: T['execute'];
}> {
  static override readonly [entityKind]: string = 'WaSqliteAsyncPreparedQuery';

  constructor(
    private readonly client: IAsyncWaSqliteClient,
    query: Query,
    private readonly logger: Logger,
    private readonly fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    private readonly responseInArrayMode: boolean,
    private readonly customResultMapper?: (
      rows: unknown[][] | Record<string, unknown>[],
    ) => unknown,
    private readonly isRqbV2Query?: TIsRqbV2,
  ) {
    super('async', executeMethod, query, undefined, undefined, undefined);
  }

  override async run(
    placeholderValues?: Record<string, unknown>,
  ): Promise<IWaSqliteRunResult> {
    const parameters = fillPlaceholders(
      this.query.params,
      placeholderValues ?? {},
    );
    this.logger.logQuery(this.query.sql, parameters);
    await executeValuesRows({
      client: this.client,
      sql: this.query.sql,
      parameters,
    });

    return {
      changes: this.client.sqlite3.changes(this.client.db),
    };
  }

  override async all(
    placeholderValues?: Record<string, unknown>,
  ): Promise<T['all']> {
    if (this.isRqbV2Query) {
      return this.allRqbV2(placeholderValues);
    }

    const joinsNotNullableMap = (
      this as {
        joinsNotNullableMap?: Record<string, boolean>;
      }
    ).joinsNotNullableMap;
    const { fields, query, logger, customResultMapper } = this;

    if (!fields && !customResultMapper) {
      const parameters = fillPlaceholders(
        query.params,
        placeholderValues ?? {},
      );
      logger.logQuery(query.sql, parameters);

      return (await executeObjectRows({
        client: this.client,
        sql: query.sql,
        parameters,
      })) as T['all'];
    }
    const rows = (await this.values(placeholderValues)) as Array<unknown[]>;
    if (customResultMapper) {
      return customResultMapper(rows) as T['all'];
    }

    return rows.map(row =>
      mapSelectedRow(fields as SelectedFieldsOrdered, row, joinsNotNullableMap),
    ) as T['all'];
  }

  override async get(
    placeholderValues?: Record<string, unknown>,
  ): Promise<T['get']> {
    if (this.isRqbV2Query) {
      return this.getRqbV2(placeholderValues);
    }

    const parameters = fillPlaceholders(
      this.query.params,
      placeholderValues ?? {},
    );
    this.logger.logQuery(this.query.sql, parameters);

    const joinsNotNullableMap = (
      this as {
        joinsNotNullableMap?: Record<string, boolean>;
      }
    ).joinsNotNullableMap;
    const { fields, customResultMapper } = this;

    if (!fields && !customResultMapper) {
      return (
        await executeObjectRows({
          client: this.client,
          sql: this.query.sql,
          parameters,
        })
      )[0] as T['get'];
    }
    const row = ((await this.values(placeholderValues)) as Array<unknown[]>)[0];
    if (!row) {
      return undefined as T['get'];
    }

    if (customResultMapper) {
      return customResultMapper([row]) as T['get'];
    }

    return mapSelectedRow(
      fields as SelectedFieldsOrdered,
      row,
      joinsNotNullableMap,
    ) as T['get'];
  }

  override async values(
    placeholderValues?: Record<string, unknown>,
  ): Promise<T['values']> {
    const parameters = fillPlaceholders(
      this.query.params,
      placeholderValues ?? {},
    );
    this.logger.logQuery(this.query.sql, parameters);

    return (await executeValuesRows({
      client: this.client,
      sql: this.query.sql,
      parameters,
    })) as T['values'];
  }

  /** @internal */
  isResponseInArrayMode(): boolean {
    return this.responseInArrayMode;
  }

  private async allRqbV2(
    placeholderValues?: Record<string, unknown>,
  ): Promise<T['all']> {
    const parameters = fillPlaceholders(
      this.query.params,
      placeholderValues ?? {},
    );
    this.logger.logQuery(this.query.sql, parameters);

    return this.customResultMapper!(
      await executeObjectRows({
        client: this.client,
        sql: this.query.sql,
        parameters,
      }),
    ) as T['all'];
  }

  private async getRqbV2(
    placeholderValues?: Record<string, unknown>,
  ): Promise<T['get']> {
    const parameters = fillPlaceholders(
      this.query.params,
      placeholderValues ?? {},
    );
    this.logger.logQuery(this.query.sql, parameters);

    const row = (
      await executeObjectRows({
        client: this.client,
        sql: this.query.sql,
        parameters,
      })
    )[0];

    if (row === undefined) {
      return row as T['get'];
    }

    return this.customResultMapper!([row]) as T['get'];
  }
}
