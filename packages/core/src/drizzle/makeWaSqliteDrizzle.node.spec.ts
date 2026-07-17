import { eq, param, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { makeTable } from '../models/makeTable.ts';
import { primitives } from '../models/primitives.ts';

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
const users = dbConfig.schema.users;

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
  it('supports sync builder methods and run() change counts', async () => {
    const { client, db } = await makeTestDatabase();

    try {
      const insertAda = db
        .insert(users)
        .values({
          id: 'usr_ada',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
        })
        .run();
      const insertGrace = db
        .insert(users)
        .values({
          id: 'usr_grace',
          name: 'Grace Hopper',
          email: 'grace@example.com',
        })
        .run();
      const updateGrace = db
        .update(users)
        .set({ name: 'Rear Admiral Grace Hopper' })
        .where(eq(users.email, 'grace@example.com'))
        .run();
      const deleteAda = db
        .delete(users)
        .where(eq(users.email, 'ada@example.com'))
        .run();

      const allUsers = db.select().from(users).orderBy(users.id).all();
      const firstUser = db
        .select()
        .from(users)
        .where(eq(users.email, 'grace@example.com'))
        .limit(1)
        .get();
      const values = db
        .select({ id: users.id, email: users.email })
        .from(users)
        .orderBy(users.id)
        .values();

      expect(insertAda.changes).toBe(1);
      expect(insertGrace.changes).toBe(1);
      expect(updateGrace.changes).toBe(1);
      expect(deleteAda.changes).toBe(1);
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
      db.insert(users)
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
        tx.insert(users)
          .values({
            id: 'usr_ada',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
          })
          .run();

        return tx.select().from(users).orderBy(users.id).all();
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
          tx.insert(users)
            .values({
              id: 'usr_grace',
              name: 'Grace Hopper',
              email: 'grace@example.com',
            })
            .run();
          throw new Error('rollback outer transaction');
        }),
      ).toThrow('rollback outer transaction');

      const afterRollback = db.select().from(users).orderBy(users.id).all();
      expect(afterRollback).toEqual([
        {
          id: 'usr_ada',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
        },
      ]);

      const afterNestedRollback = db.transaction(tx => {
        tx.insert(users)
          .values({
            id: 'usr_katherine',
            name: 'Katherine Johnson',
            email: 'kj@example.com',
          })
          .run();

        expect(() =>
          tx.transaction(nestedTransaction => {
            nestedTransaction
              .insert(users)
              .values({
                id: 'usr_nested',
                name: 'Nested User',
                email: 'nested@example.com',
              })
              .run();
            throw new Error('rollback nested transaction');
          }),
        ).toThrow('rollback nested transaction');

        return tx.select().from(users).orderBy(users.id).all();
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
});
