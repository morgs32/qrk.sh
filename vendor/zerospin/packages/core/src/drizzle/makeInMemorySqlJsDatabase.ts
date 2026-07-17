import initSqlJs from 'sql.js';

/**
 * Creates an in-memory sql.js Database.
 * Caller is responsible for calling db.close() when done.
 */
export async function makeInMemorySqlJsDatabase() {
  const SQL = await initSqlJs();
  return new SQL.Database();
}
