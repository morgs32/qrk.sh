import { makeTable, primitives } from '@zerospin/schema';
import { eq, param, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { makeDbConfig } from './makeDbConfig.ts';
import { makeInMemorySQLite3 } from './makeInMemorySQLite3.ts';
import { makeWaSqliteDrizzle } from './makeWaSqliteDrizzle.ts';

const usersTable = makeTable({
  name: 'users',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'usr' }),
    name: primitives.text(),
    email: primitives.text({ unique: true }),
  },
});
const dbConfig = makeDbConfig({ tables: { users: usersTable } });

async function makeTestDatabase() {
  const client = await makeInMemorySQLite3();
  const db = makeWaSqliteDrizzle(client, dbConfig);

  db.run(sql`
    create table users (
      id text primary key not null,
      name text not null,
      email text not null unique
    )
  `);

  return {
    client,
    db,
  };
}

describe('makeWaSqliteDrizzle', () => {
  it('invalidates mounted queries once when a restored database reports its tables', async () => {
    const { client, db } = await makeTestDatabase();
    const notifications: ReadonlySet<string>[] = [];
    const unsubscribe = client.subscribeToTableChanges(tableNames => {
      notifications.push(tableNames);
      // A notification must arrive outside SQLite execution: listeners read
      // synchronously through the same connection used for restored pages.
      expect(db.query.users.findMany().sync()).toEqual([]);
    });
    try {
      client.flushTableChanges(new Set(['users']));
      client.flushTableChanges();
      expect(notifications).toEqual([new Set(['users'])]);
      unsubscribe();
      client.flushTableChanges(new Set(['users']));
      expect(notifications).toHaveLength(1);
    } finally {
      unsubscribe();
      await client.sqlite3.close(client.db);
    }
  });

  it('enables immediate SQLite foreign-key enforcement', async () => {
    const { client, db } = await makeTestDatabase();

    try {
      expect(
        db.get<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`),
      ).toEqual({ foreign_keys: 1 });

      db.run(sql`
        create table parent_rows (
          id text primary key not null
        )
      `);
      db.run(sql`
        create table child_rows (
          id text primary key not null,
          parent_id text not null,
          foreign key (parent_id) references parent_rows (id)
        )
      `);

      expect(() =>
        db.run(sql`
          insert into child_rows (id, parent_id)
          values ('child-1', 'missing-parent')
        `),
      ).toThrow('Failed query:');
    } finally {
      await client.sqlite3.close(client.db);
    }
  });

  it('supports sync builder methods and run() change counts', async () => {
    const { client, db } = await makeTestDatabase();

    try {
      const insertAda = db
        .insert(dbConfig.schema.users)
        .values({
          id: 'usr_ada',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
        })
        .run();
      const insertGrace = db
        .insert(dbConfig.schema.users)
        .values({
          id: 'usr_grace',
          name: 'Grace Hopper',
          email: 'grace@example.com',
        })
        .run();
      const updateGrace = db
        .update(dbConfig.schema.users)
        .set({ name: 'Rear Admiral Grace Hopper' })
        .where(eq(dbConfig.schema.users.email, 'grace@example.com'))
        .run();
      const deleteAda = db
        .delete(dbConfig.schema.users)
        .where(eq(dbConfig.schema.users.email, 'ada@example.com'))
        .run();

      const allUsers = db.select().from(dbConfig.schema.users).orderBy(dbConfig.schema.users.id).all();
      const firstUser = db
        .select()
        .from(dbConfig.schema.users)
        .where(eq(dbConfig.schema.users.email, 'grace@example.com'))
        .limit(1)
        .get();
      const values = db
        .select({ id: dbConfig.schema.users.id, email: dbConfig.schema.users.email })
        .from(dbConfig.schema.users)
        .orderBy(dbConfig.schema.users.id)
        .values();

      expect(insertAda).toMatchObject({ changes: 1 });
      expect(insertGrace).toMatchObject({ changes: 1 });
      expect(updateGrace).toMatchObject({ changes: 1 });
      expect(deleteAda).toMatchObject({ changes: 1 });
      expect(allUsers).toEqual([
        {
          id: 'usr_grace',
          name: 'Rear Admiral Grace Hopper',
          email: 'grace@example.com',
        },
      ]);
      expect(firstUser).toEqual({
        id: 'usr_grace',
        name: 'Rear Admiral Grace Hopper',
        email: 'grace@example.com',
      });
      expect(values).toEqual([['usr_grace', 'grace@example.com']]);
    } finally {
      await client.sqlite3.close(client.db);
    }
  });

  it('supports db.query.*.sync()', async () => {
    const { client, db } = await makeTestDatabase();

    try {
      db.insert(dbConfig.schema.users)
        .values([
          {
            id: 'usr_ada',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
          },
          {
            id: 'usr_grace',
            name: 'Grace Hopper',
            email: 'grace@example.com',
          },
          {
            id: 'usr_katherine',
            name: 'Katherine Johnson',
            email: 'kj@example.com',
          },
        ])
        .run();

      const matchingUsers = db.query.users
        .findMany({
          where: { name: { like: 'G%' } },
          orderBy: (user, { asc }) => [asc(user.id)],
        })
        .sync();
      const firstUser = db.query.users
        .findFirst({
          where: { email: 'kj@example.com' },
        })
        .sync();

      expect(matchingUsers).toEqual([
        {
          id: 'usr_grace',
          name: 'Grace Hopper',
          email: 'grace@example.com',
        },
      ]);
      expect(firstUser).toEqual({
        id: 'usr_katherine',
        name: 'Katherine Johnson',
        email: 'kj@example.com',
      });
    } finally {
      await client.sqlite3.close(client.db);
    }
  });

  it('commits, rolls back, and supports nested savepoints', async () => {
    const { client, db } = await makeTestDatabase();

    try {
      const committedUsers = db.transaction(tx => {
        tx.insert(dbConfig.schema.users)
          .values({
            id: 'usr_ada',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
          })
          .run();

        return tx.select().from(dbConfig.schema.users).orderBy(dbConfig.schema.users.id).all();
      });

      expect(committedUsers).toEqual([
        {
          id: 'usr_ada',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
        },
      ]);

      expect(() =>
        db.transaction(tx => {
          tx.insert(dbConfig.schema.users)
            .values({
              id: 'usr_grace',
              name: 'Grace Hopper',
              email: 'grace@example.com',
            })
            .run();
          throw new Error('rollback outer transaction');
        }),
      ).toThrow('rollback outer transaction');

      const afterRollback = db.select().from(dbConfig.schema.users).orderBy(dbConfig.schema.users.id).all();
      expect(afterRollback).toEqual([
        {
          id: 'usr_ada',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
        },
      ]);

      const afterNestedRollback = db.transaction(tx => {
        tx.insert(dbConfig.schema.users)
          .values({
            id: 'usr_katherine',
            name: 'Katherine Johnson',
            email: 'kj@example.com',
          })
          .run();

        expect(() =>
          tx.transaction(nestedTransaction => {
            nestedTransaction
              .insert(dbConfig.schema.users)
              .values({
                id: 'usr_nested',
                name: 'Nested User',
                email: 'nested@example.com',
              })
              .run();
            throw new Error('rollback nested transaction');
          }),
        ).toThrow('rollback nested transaction');

        return tx.select().from(dbConfig.schema.users).orderBy(dbConfig.schema.users.id).all();
      });

      expect(afterNestedRollback).toEqual([
        {
          id: 'usr_ada',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
        },
        {
          id: 'usr_katherine',
          name: 'Katherine Johnson',
          email: 'kj@example.com',
        },
      ]);
    } finally {
      await client.sqlite3.close(client.db);
    }
  });

  it('binds raw query parameters for date, bigint, blobs, arrays, and null', async () => {
    const { client, db } = await makeTestDatabase();

    try {
      const dateValue = new Date('2024-01-02T03:04:05.000Z');
      const bigintValue = 9_007_199_254_740_993n;
      const blobValue = new Uint8Array([1, 2, 3]);
      const arrayValue = [4, 5, 6];

      db.run(sql`
        create table parameter_values (
          date_value integer,
          bigint_value integer,
          blob_value blob,
          array_value blob,
          null_value text
        )
      `);

      db.run(sql`
        insert into parameter_values (
          date_value,
          bigint_value,
          blob_value,
          array_value,
          null_value
        ) values (
          ${dateValue},
          ${bigintValue},
          ${blobValue},
          ${param(arrayValue)},
          ${null}
        )
      `);

      const row = db.get<{
        array_value: Uint8Array;
        bigint_value: bigint;
        blob_value: Uint8Array;
        date_value: number;
        null_value: null;
      }>(sql`
        select
          date_value,
          bigint_value,
          blob_value,
          array_value,
          null_value
        from parameter_values
      `);

      expect(row?.date_value).toBe(dateValue.getTime());
      expect(row?.bigint_value).toBe(bigintValue);
      expect(Array.from(row?.blob_value ?? [])).toEqual([1, 2, 3]);
      expect(Array.from(row?.array_value ?? [])).toEqual([4, 5, 6]);
      expect(row?.null_value).toBeNull();
    } finally {
      await client.sqlite3.close(client.db);
    }
  });

  it('captures committed writes from every statement terminal with normalized parameters', async () => {
    const { client, db } = await makeTestDatabase();
    const committedTransactions: Array<
      Parameters<NonNullable<typeof client.onCommittedTransaction>>[0]
    > = [];

    try {
      client.onCommittedTransaction = statements => {
        committedTransactions.push(statements);
      };

      db.insert(dbConfig.schema.users)
        .values({
          id: 'usr_run',
          name: 'Run',
          email: 'run@example.com',
        })
        .run();
      db.insert(dbConfig.schema.users)
        .values({
          id: 'usr_get',
          name: sql`${param([1, 2, 3])}`,
          email: 'get@example.com',
        })
        .returning()
        .get();
      db.update(dbConfig.schema.users)
        .set({ name: 'All' })
        .where(eq(dbConfig.schema.users.id, 'usr_run'))
        .returning()
        .all();
      db.delete(dbConfig.schema.users)
        .where(eq(dbConfig.schema.users.id, 'usr_run'))
        .returning()
        .values();

      expect(committedTransactions).toHaveLength(4);
      expect(committedTransactions.every(batch => batch.length === 1)).toBe(
        true,
      );
      expect(committedTransactions.map(([statement]) => statement?.sql)).toEqual(
        [
          expect.stringMatching(/^insert into "users"/),
          expect.stringMatching(/^insert into "users"/),
          expect.stringMatching(/^update "users"/),
          expect.stringMatching(/^delete from "users"/),
        ],
      );
      expect(
        committedTransactions[1]?.[0]?.parameters.some(
          parameter =>
            parameter instanceof Uint8Array &&
            Array.from(parameter).join(',') === '1,2,3',
        ),
      ).toBe(true);
    } finally {
      await client.sqlite3.close(client.db);
    }
  });

  it('emits only committed outer transactions and preserves nested savepoint order', async () => {
    const { client, db } = await makeTestDatabase();
    const committedTransactions: Array<
      Parameters<NonNullable<typeof client.onCommittedTransaction>>[0]
    > = [];

    try {
      client.onCommittedTransaction = statements => {
        committedTransactions.push(statements);
      };

      db.transaction(tx => {
        tx.insert(dbConfig.schema.users)
          .values({
            id: 'usr_outer',
            name: 'Outer',
            email: 'outer@example.com',
          })
          .run();
        tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
        tx.transaction(nestedTx => {
          nestedTx
            .update(dbConfig.schema.users)
            .set({ name: 'Nested' })
            .where(eq(dbConfig.schema.users.id, 'usr_outer'))
            .run();
        });
        expect(() =>
          tx.transaction(nestedTx => {
            nestedTx
              .delete(dbConfig.schema.users)
              .where(eq(dbConfig.schema.users.id, 'usr_outer'))
              .run();
            throw new Error('discard nested statements');
          }),
        ).toThrow('discard nested statements');
      });

      expect(committedTransactions).toHaveLength(1);
      expect(committedTransactions[0]?.map(statement => statement.sql)).toEqual(
        [
          expect.stringMatching(/^insert into "users"/),
          'PRAGMA defer_foreign_keys = ON;',
          expect.stringMatching(/^update "users"/),
        ],
      );

      expect(() =>
        db.transaction(tx => {
          tx.delete(dbConfig.schema.users).where(eq(dbConfig.schema.users.id, 'usr_outer')).run();
          throw new Error('discard outer statements');
        }),
      ).toThrow('discard outer statements');
      expect(committedTransactions).toHaveLength(1);
    } finally {
      await client.sqlite3.close(client.db);
    }
  });

  it('rejects unknown raw SQL only while committed transaction capture is active', async () => {
    const { client, db } = await makeTestDatabase();

    try {
      db.run(sql.raw('create table capture_disabled (id integer)'));
      client.onCommittedTransaction = () => undefined;

      expect(() =>
        db.run(sql.raw('create table capture_enabled (id integer)')),
      ).toThrow('Failed query: create table capture_enabled');
      expect(
        db.get<{ count: number }>(sql`
          select count(*) as count
          from sqlite_master
          where name = 'capture_enabled'
        `),
      ).toEqual({ count: 0 });

      client.onCommittedTransaction = null;
      db.run(sql.raw('create table capture_re_disabled (id integer)'));
    } finally {
      await client.sqlite3.close(client.db);
    }
  });
});
