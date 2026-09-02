import * as SQLite from '@livestore/wa-sqlite';
import { entityKind } from 'drizzle-orm/entity';
import { NoopLogger, type Logger } from 'drizzle-orm/logger';
import type { AnyRelations } from 'drizzle-orm/relations';
import {
  SQLiteAsyncPreparedQuery,
  SQLiteAsyncSession,
  SQLiteAsyncTransaction,
} from 'drizzle-orm/sqlite-core/async/session';
import type { SQLiteDialect } from 'drizzle-orm/sqlite-core/dialect';
import type {
  SQLiteExecuteMethod,
  SQLiteTransactionConfig,
} from 'drizzle-orm/sqlite-core/session';
import { sql, type Query } from 'drizzle-orm/sql/sql';
import type { DrizzleTypeError } from 'drizzle-orm/utils';

import type { IWaSqliteClient, IWaSqliteRunResult } from './types.ts';

type IWaSqliteSessionOptions = {
  logger?: Logger;
};

type IPreparedQueryConfig = {
  type: 'sync';
  run: IWaSqliteRunResult;
  all: unknown;
  get: unknown;
  values: unknown[][];
  execute: unknown;
};

type IExecuteRowsProps = {
  captureStack: ICommittedSqlStatement[][];
  client: IWaSqliteClient;
  parameters: ReadonlyArray<unknown>;
  queryMetadata:
    | {
        type: 'select' | 'update' | 'delete' | 'insert';
        tables: string[];
      }
    | undefined;
  sql: string;
};

export type ISqliteStatementParameter =
  | number
  | string
  | Uint8Array
  | bigint
  | null;

export type ICommittedSqlStatement = Readonly<{
  sql: string;
  parameters: readonly ISqliteStatementParameter[];
}>;

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
    return new Uint8Array(parameter);
  }
  if (parameter instanceof Date) {
    return parameter.getTime();
  }
  throw new Error(`Unsupported sqlite parameter type: ${typeof parameter}`);
}

function executeValuesRows(props: IExecuteRowsProps): unknown[][] {
  const { captureStack, client, sql: querySql, parameters, queryMetadata } =
    props;
  const { sqlite3, db } = client;
  const boundParameters = parameters.map(parameter =>
    toSqliteStatementParameter(parameter),
  );
  const rows: unknown[][] = [];
  let shouldCapture =
    queryMetadata?.type === 'insert' ||
    queryMetadata?.type === 'update' ||
    queryMetadata?.type === 'delete';

  if (client.onCommittedTransaction !== null && queryMetadata === undefined) {
    const normalizedSql = querySql.trim().replace(/;+$/, '').trim();

    if (/^pragma\s+defer_foreign_keys\s*=\s*on$/i.test(normalizedSql)) {
      shouldCapture = true;
    } else if (
      /^(?:begin(?:\s+\w+)?|commit|rollback|savepoint\s+\w+|release\s+savepoint\s+\w+|rollback\s+to\s+savepoint\s+\w+)$/i.test(
        normalizedSql,
      ) ||
      /^(?:select|explain|pragma\b)/i.test(normalizedSql)
    ) {
      shouldCapture = false;
    } else {
      throw new Error(
        `Unsupported raw SQL while committed transaction capture is active: ${querySql}`,
      );
    }
  }

  try {
    for (const statement of sqlite3.statements(db, querySql, {
      unscoped: true,
    })) {
      try {
        if (boundParameters.length > 0) {
          sqlite3.bind_collection(statement, boundParameters);
        }

        let stepResult = sqlite3.step(statement);
        while (stepResult === SQLite.SQLITE_ROW) {
          rows.push(sqlite3.row(statement));
          stepResult = sqlite3.step(statement);
        }
      } finally {
        sqlite3.finalize(statement);
      }
    }
  } finally {
    // The SQLite hooks only recorded invalidations while step was active. The
    // current statement is finalized before live-query listeners may run SQL.
    client.flushTableChanges();
  }

  if (client.onCommittedTransaction !== null && shouldCapture) {
    const statement = {
      sql: querySql,
      parameters: boundParameters,
    } satisfies ICommittedSqlStatement;
    const currentTransaction = captureStack.at(-1);

    if (currentTransaction === undefined) {
      client.onCommittedTransaction([statement]);
    } else {
      currentTransaction.push(statement);
    }
  }

  return rows;
}

function executeObjectRows(
  props: IExecuteRowsProps,
): Record<string, unknown>[] {
  const { captureStack, client, sql: querySql, parameters, queryMetadata } =
    props;
  const { sqlite3, db } = client;
  const boundParameters = parameters.map(parameter =>
    toSqliteStatementParameter(parameter),
  );
  const rows: Record<string, unknown>[] = [];
  let shouldCapture =
    queryMetadata?.type === 'insert' ||
    queryMetadata?.type === 'update' ||
    queryMetadata?.type === 'delete';

  if (client.onCommittedTransaction !== null && queryMetadata === undefined) {
    const normalizedSql = querySql.trim().replace(/;+$/, '').trim();

    if (/^pragma\s+defer_foreign_keys\s*=\s*on$/i.test(normalizedSql)) {
      shouldCapture = true;
    } else if (
      /^(?:begin(?:\s+\w+)?|commit|rollback|savepoint\s+\w+|release\s+savepoint\s+\w+|rollback\s+to\s+savepoint\s+\w+)$/i.test(
        normalizedSql,
      ) ||
      /^(?:select|explain|pragma\b)/i.test(normalizedSql)
    ) {
      shouldCapture = false;
    } else {
      throw new Error(
        `Unsupported raw SQL while committed transaction capture is active: ${querySql}`,
      );
    }
  }

  try {
    for (const statement of sqlite3.statements(db, querySql, {
      unscoped: true,
    })) {
      try {
        if (boundParameters.length > 0) {
          sqlite3.bind_collection(statement, boundParameters);
        }

        const columnNames = sqlite3.column_names(statement);
        let stepResult = sqlite3.step(statement);
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
          stepResult = sqlite3.step(statement);
        }
      } finally {
        sqlite3.finalize(statement);
      }
    }
  } finally {
    // Object-row queries share the same post-step flush boundary as value-row
    // queries so relational live queries cannot run from inside update_hook.
    client.flushTableChanges();
  }

  if (client.onCommittedTransaction !== null && shouldCapture) {
    const statement = {
      sql: querySql,
      parameters: boundParameters,
    } satisfies ICommittedSqlStatement;
    const currentTransaction = captureStack.at(-1);

    if (currentTransaction === undefined) {
      client.onCommittedTransaction([statement]);
    } else {
      currentTransaction.push(statement);
    }
  }

  return rows;
}

export class WaSqliteSession<
  TRelations extends AnyRelations,
> extends SQLiteAsyncSession<'sync', IWaSqliteRunResult, TRelations> {
  static override readonly [entityKind]: string = 'WaSqliteSession';

  private readonly logger: Logger;
  private readonly captureStack: ICommittedSqlStatement[][] = [];

  constructor(
    private readonly client: IWaSqliteClient,
    dialect: SQLiteDialect,
    private readonly relations: TRelations,
    options: IWaSqliteSessionOptions = {},
  ) {
    super(dialect, 'sync');
    this.logger = options.logger ?? new NoopLogger();
  }

  override prepareQuery(
    query: Query,
    mode: 'arrays' | 'objects' | 'raw',
    _prepare: boolean,
    executeMethod?: SQLiteExecuteMethod,
    mapper?: (rows: unknown[]) => unknown,
    queryMetadata?: {
      type: 'select' | 'update' | 'delete' | 'insert';
      tables: string[];
    },
  ): SQLiteAsyncPreparedQuery<IPreparedQueryConfig> {
    return new SQLiteAsyncPreparedQuery<IPreparedQueryConfig>(
      'sync',
      executeMethod,
      {
        all: parameters =>
          mode === 'arrays'
            ? executeValuesRows({
                captureStack: this.captureStack,
                client: this.client,
                sql: query.sql,
                parameters,
                queryMetadata,
              })
            : executeObjectRows({
                captureStack: this.captureStack,
                client: this.client,
                sql: query.sql,
                parameters,
                queryMetadata,
              }),
        get: parameters =>
          mode === 'arrays'
            ? executeValuesRows({
                captureStack: this.captureStack,
                client: this.client,
                sql: query.sql,
                parameters,
                queryMetadata,
              })[0]
            : executeObjectRows({
                captureStack: this.captureStack,
                client: this.client,
                sql: query.sql,
                parameters,
                queryMetadata,
              })[0],
        run: parameters => {
          executeValuesRows({
            captureStack: this.captureStack,
            client: this.client,
            sql: query.sql,
            parameters,
            queryMetadata,
          });
          return { changes: this.client.sqlite3.changes(this.client.db) };
        },
        values: parameters =>
          executeValuesRows({
            captureStack: this.captureStack,
            client: this.client,
            sql: query.sql,
            parameters,
            queryMetadata,
          }),
      },
      query,
      mapper,
      mode,
      this.logger,
      undefined,
      queryMetadata,
      undefined,
    );
  }

  override transaction<T>(
    transaction: (tx: WaSqliteTransaction<TRelations>) => T,
    config: SQLiteTransactionConfig = {},
  ): T {
    const tx = new WaSqliteTransaction(
      'sync',
      this.dialect,
      this,
      this.relations,
      undefined,
      true,
      this.captureStack,
    );
    this.run(sql.raw(`begin${config.behavior ? ` ${config.behavior}` : ''}`));
    this.captureStack.push([]);

    let isCommitted = false;
    try {
      const result = transaction(tx);
      this.run(sql`commit`);
      isCommitted = true;
      const statements = this.captureStack.pop();
      if (
        this.client.onCommittedTransaction !== null &&
        statements !== undefined &&
        statements.length > 0
      ) {
        this.client.onCommittedTransaction(statements);
      }
      return result;
    } finally {
      if (!isCommitted) {
        try {
          this.run(sql`rollback`);
        } finally {
          this.captureStack.pop();
        }
      }
    }
  }
}

export class WaSqliteTransaction<
  TRelations extends AnyRelations,
> extends SQLiteAsyncTransaction<'sync', IWaSqliteRunResult, TRelations> {
  static override readonly [entityKind]: string = 'WaSqliteTransaction';

  constructor(
    resultType: 'sync',
    dialect: SQLiteDialect,
    session: SQLiteAsyncSession<'sync', IWaSqliteRunResult, TRelations>,
    relations: TRelations,
    nestedIndex?: number,
    forbidJsonb?: boolean,
    private readonly transactionCaptureStack: ICommittedSqlStatement[][] = [],
  ) {
    super(resultType, dialect, session, relations, nestedIndex, forbidJsonb);
    this.transactionDialect = dialect;
    this.transactionSession = session;
    this.transactionRelations = relations;
  }

  private readonly transactionDialect: SQLiteDialect;
  private readonly transactionSession: SQLiteAsyncSession<
    'sync',
    IWaSqliteRunResult,
    TRelations
  >;
  private readonly transactionRelations: TRelations;

  override transaction<T>(
    transaction: (
      tx: WaSqliteTransaction<TRelations>,
    ) => T extends Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any -- Promise<any> vs Promise<unknown> are not equivalent in conditional types; unknown breaks Drizzle's assignability
      ? DrizzleTypeError<"Sync drivers can't use async functions in transactions!">
      : T,
  ): T {
    const savepointName = `sp${this.nestedIndex + 1}`;
    const tx = new WaSqliteTransaction(
      'sync',
      this.transactionDialect,
      this.transactionSession,
      this.transactionRelations,
      this.nestedIndex + 1,
      true,
      this.transactionCaptureStack,
    );

    tx.run(sql.raw(`savepoint ${savepointName}`));
    this.transactionCaptureStack.push([]);

    let isReleased = false;
    try {
      const result = transaction(tx);
      tx.run(sql.raw(`release savepoint ${savepointName}`));
      isReleased = true;
      const statements = this.transactionCaptureStack.pop();
      const parentTransaction = this.transactionCaptureStack.at(-1);
      if (statements !== undefined && parentTransaction !== undefined) {
        parentTransaction.push(...statements);
      }
      return result as T;
    } finally {
      if (!isReleased) {
        try {
          tx.run(sql.raw(`rollback to savepoint ${savepointName}`));
        } finally {
          this.transactionCaptureStack.pop();
        }
      }
    }
  }
}
