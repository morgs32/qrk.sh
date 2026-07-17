import { describe, expect, it } from 'vitest';

import { makeInMemorySQLite3 } from './makeInMemorySQLite3.ts';

describe('wa-sqlite integration', () => {
  it('creates async in-memory db, then sync create/insert/select and snapshots the row', async () => {
    const { sqlite3, db } = await makeInMemorySQLite3();

    sqlite3.exec(
      db,
      'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)',
    );
    sqlite3.exec(db, "INSERT INTO notes (body) VALUES ('hello from test')");

    const rows: (string | number)[][] = [];
    sqlite3.exec(
      db,
      'SELECT id, body FROM notes ORDER BY id',
      (row: unknown[], columns: string[]) => {
        const [idColumn = '', bodyColumn = ''] = columns;
        rows.push([idColumn, bodyColumn, row[0] as number, row[1] as string]);
      },
    );

    expect(rows).toMatchInlineSnapshot(`
      [
        [
          "id",
          "body",
          1,
          "hello from test",
        ],
        [
          "id",
          "body",
          1,
          "hello from test",
        ],
      ]
    `);

    await sqlite3.close(db);
  });

  it('creates table, adds listener, updates and inserts, and listener is called synchronously', async () => {
    const { sqlite3, db } = await makeInMemorySQLite3();

    sqlite3.exec(
      db,
      'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)',
    );
    sqlite3.exec(db, "INSERT INTO notes (body) VALUES ('before')");

    // Flag to verify the update hook is invoked synchronously during exec():
    // we set it true before exec() and false after; if the hook runs deferred,
    // it would see false. We assert every event has calledWhileRunning === true.
    let runningStatement = false;
    const events: {
      updateType: number;
      dbName: string;
      tableName: string;
      rowId: number;
      calledWhileRunning: boolean;
    }[] = [];
    sqlite3.update_hook(
      db,
      (
        updateType: number,
        dbName: string | null,
        tableName: string | null,
        rowId: bigint,
      ) => {
        events.push({
          updateType,
          dbName: dbName ?? '',
          tableName: tableName ?? '',
          rowId: Number(rowId),
          calledWhileRunning: runningStatement,
        });
      },
    );

    runningStatement = true;
    sqlite3.exec(db, "UPDATE notes SET body = 'after' WHERE id = 1");
    sqlite3.exec(db, "INSERT INTO notes (body) VALUES ('new row')");
    runningStatement = false;

    expect(events).toMatchInlineSnapshot(`
      [
        {
          "calledWhileRunning": true,
          "dbName": "main",
          "rowId": 1,
          "tableName": "notes",
          "updateType": 23,
        },
        {
          "calledWhileRunning": true,
          "dbName": "main",
          "rowId": 2,
          "tableName": "notes",
          "updateType": 18,
        },
      ]
    `);
    expect(events.every(event => event.calledWhileRunning)).toBe(true);

    await sqlite3.close(db);
  });
});
