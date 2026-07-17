import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core';

/** Returns CREATE TABLE and index SQL for a single Drizzle SQLite table. */
export function makeTableMigrationStatements(
  table: SQLiteTable,
): readonly string[] {
  const tableConfig = getTableConfig(table);
  const hasTableLevelPrimaryKey = tableConfig.primaryKeys.length > 0;
  const columnLines = tableConfig.columns.map(column => {
    const constraints = [];
    if (column.primary && !hasTableLevelPrimaryKey) {
      constraints.push('PRIMARY KEY');
    }
    if ('autoIncrement' in column && column.autoIncrement) {
      constraints.push('AUTOINCREMENT');
    }
    if (column.notNull) {
      constraints.push('NOT NULL');
    }
    if (typeof column.default === 'number') {
      constraints.push(`DEFAULT ${column.default}`);
    } else if (typeof column.default === 'boolean') {
      constraints.push(`DEFAULT ${column.default ? 1 : 0}`);
    } else if (typeof column.default === 'string') {
      constraints.push(`DEFAULT '${column.default.replaceAll("'", "''")}'`);
    } else if (column.default instanceof Date) {
      constraints.push(
        `DEFAULT ${Math.floor(column.default.getTime() / 1000)}`,
      );
    } else if (column.default === null) {
      constraints.push('DEFAULT NULL');
    }
    return [column.name, column.getSQLType(), ...constraints].join(' ');
  });

  const primaryKeyLines = tableConfig.primaryKeys.map(primaryKey => {
    const columnNames = primaryKey.columns
      .map(column => column.name)
      .join(', ');
    return `PRIMARY KEY (${columnNames})`;
  });

  const tableDefinition = [...columnLines, ...primaryKeyLines].join(',\n  ');

  const statements: string[] = [
    `CREATE TABLE ${tableConfig.name} (\n  ${tableDefinition}\n);`,
  ];

  for (const index of tableConfig.indexes) {
    const columnNames = index.config.columns
      .map(column => ('name' in column ? column.name : String(column)))
      .join(', ');
    const uniqueKeyword = index.config.unique ? 'UNIQUE ' : '';
    statements.push(
      `CREATE ${uniqueKeyword}INDEX ${index.config.name} ON ${tableConfig.name} (${columnNames});`,
    );
  }

  return statements;
}

/** Returns CREATE TABLE SQL for a single Drizzle SQLite table. */
export function makeTableMigrationSQL(table: SQLiteTable): string {
  return makeTableMigrationStatements(table).join('\n');
}
