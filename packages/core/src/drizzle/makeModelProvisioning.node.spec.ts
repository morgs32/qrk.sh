import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { primitives } from '@zerospin/schema';
import { eq, sql } from 'drizzle-orm';
import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { makeModel } from '../models/makeModel.ts';

import { makeResourceDbConfig } from './makeDbConfig.ts';
import { makeProvisionedInMemorySqljsDb } from './makeProvisionedInMemorySqljsDb.ts';
import { makeTableProvisioningSQL } from './makeTableProvisioningSQL.ts';

const dateWithMilliseconds = new Date('2026-08-24T12:34:56.123Z');
const namePropertySchema = primitives.text();
const TinyJsonRowSchema = Schema.Struct({ x: Schema.String });

const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      name: namePropertySchema,
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const Item = makeModel(
  {
    abbreviation: 'tsk',
    modelName: 'item',
    attributes: {
      enabledDefault: primitives.boolean({ defaultValue: true }),
      count: primitives.integer(),
      countDefault: primitives.integer({ defaultValue: 5 }),
      countNullable: primitives.integer({ nullable: true }),
      ratioDefault: primitives.number({ defaultValue: 1.5 }),
      title: primitives.text(),
      titleDefault: primitives.text({ defaultValue: "it's saved" }),
      titleNullable: primitives.text({ nullable: true }),
      payloadDefault: primitives.json({
        nullable: true,
        schema: TinyJsonRowSchema,
        defaultValue: null,
      }),
      dueAt: primitives.date(),
      dueAtDefault: primitives.date({ defaultValue: dateWithMilliseconds }),
      dueAtNullable: primitives.date({ nullable: true }),
      status: primitives.enum({ values: ['todo', 'done'] }),
      statusDefault: primitives.enum({
        values: ['todo', 'done'],
        defaultValue: 'todo',
      }),
      statusNullable: primitives.enum({
        values: ['todo', 'done'],
        nullable: true,
      }),
      userId: primitives.ref({
        table: User.table,
        relation: 'user',
        inverse: 'items',
        unique: true,
      }),
      userIdNullable: primitives.ref({
        table: User.table,
        relation: 'nullableUser',
        inverse: 'nullableItems',
        nullable: true,
      }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);
const itemDrizzleSchema = makeResourceDbConfig({
  models: { user: User, item: Item },
}).schema.item;

describe('makeTableProvisioningSQL (models from makeModel)', () => {
  it('provisioningSQL contains CREATE TABLE for the model table name', () => {
    expect(makeTableProvisioningSQL(User.drizzleSchema)).toContain('CREATE TABLE');
    expect(makeTableProvisioningSQL(User.drizzleSchema)).toContain('user');
  });

  it('provisioningSQL includes metadata columns and custom attributes', () => {
    const sql = makeTableProvisioningSQL(itemDrizzleSchema);

    expect(sql).toContain('CREATE TABLE item');
    expect(sql).toContain('id text PRIMARY KEY NOT NULL');
    expect(sql).toContain('modelName text NOT NULL');
    expect(sql).toContain('createdAt integer NOT NULL');
    expect(sql).toContain('updatedAt integer NOT NULL');
    expect(sql).toContain('version text NOT NULL');
    expect(sql).toContain('title text NOT NULL');
    expect(sql).toContain('userId text NOT NULL');
    expect(sql).toContain('userId text NOT NULL UNIQUE');
  });

  it('provisioningSQL uses strict CREATE TABLE and does not include IF NOT EXISTS', () => {
    const sql = makeTableProvisioningSQL(itemDrizzleSchema);

    expect(sql).toContain('CREATE TABLE item');
    expect(sql).not.toContain('IF NOT EXISTS');
  });

  it('provisioningSQL omits NOT NULL for nullable property schemas', () => {
    const sql = makeTableProvisioningSQL(itemDrizzleSchema);

    expect(sql).toContain('countNullable integer');
    expect(sql).not.toContain('countNullable integer NOT NULL');
    expect(sql).toContain('titleNullable text');
    expect(sql).not.toContain('titleNullable text NOT NULL');
    expect(sql).toContain('dueAtNullable integer');
    expect(sql).not.toContain('dueAtNullable integer NOT NULL');
    expect(sql).toContain('statusNullable text');
    expect(sql).not.toContain('statusNullable text NOT NULL');
    expect(sql).toContain('userIdNullable text');
    expect(sql).not.toContain('userIdNullable text NOT NULL');
  });

  it('provisioningSQL emits immediate SQLite references for persisted refs', () => {
    const sql = makeTableProvisioningSQL(itemDrizzleSchema);

    expect(sql).toContain('userId text NOT NULL');
    expect(sql).toContain('userIdNullable text');
    expect(sql).toContain('FOREIGN KEY (userId) REFERENCES user (id)');
    expect(sql).toContain('FOREIGN KEY (userIdNullable) REFERENCES user (id)');
    expect(sql).not.toContain('ON DELETE');
    expect(sql).not.toContain('DEFERRABLE');
  });

  it('provisioningSQL includes expected built-in and custom column clauses', () => {
    const sql = makeTableProvisioningSQL(itemDrizzleSchema);

    expect(sql).toContain('id text PRIMARY KEY NOT NULL');
    expect(sql).toContain('enabledDefault integer NOT NULL DEFAULT 1');
    expect(sql).toContain('count integer NOT NULL');
    expect(sql).toContain('countDefault integer NOT NULL DEFAULT 5');
    expect(sql).toContain('ratioDefault real NOT NULL DEFAULT 1.5');
    expect(sql).toContain('title text NOT NULL');
    expect(sql).toContain("titleDefault text NOT NULL DEFAULT 'it''s saved'");
    expect(sql).toContain('payloadDefault text DEFAULT NULL');
    expect(sql).toContain('dueAt integer NOT NULL');
    expect(sql).toContain(
      'dueAtDefault integer NOT NULL DEFAULT 1787574896123',
    );
    expect(sql).toContain('status text NOT NULL');
    expect(sql).toContain("statusDefault text NOT NULL DEFAULT 'todo'");
    expect(sql).toContain('userId text NOT NULL');
  });

  it('provisioningSQL includes composite PRIMARY KEY from table-level primaryKey()', () => {
    const subscribers = sqliteTable(
      'subscribers',
      {
        serviceName: text().notNull(),
        name: text().notNull(),
      },
      table => [primaryKey({ columns: [table.serviceName, table.name] })],
    );
    const sql = makeTableProvisioningSQL(subscribers);

    expect(sql).toContain('PRIMARY KEY (serviceName, name)');
    expect(sql).not.toContain('serviceName text PRIMARY KEY');
  });

  it.effect('stores explicit and default dates as exact milliseconds', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({
        models: { user: User, item: Item },
      });
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });
      const userId = User.prefixId('date-milliseconds');
      const itemId = Item.prefixId('date-milliseconds');

      db.insert(dbConfig.schema.user)
        .values({
          id: userId,
          modelName: User.modelName,
          createdAt: dateWithMilliseconds,
          updatedAt: dateWithMilliseconds,
          version: User.version,
          name: 'Date milliseconds user',
        })
        .run();
      db.insert(dbConfig.schema.item)
        .values({
          id: itemId,
          modelName: Item.modelName,
          createdAt: dateWithMilliseconds,
          updatedAt: dateWithMilliseconds,
          version: Item.version,
          count: 1,
          title: 'Date milliseconds item',
          dueAt: dateWithMilliseconds,
          status: 'todo',
          userId,
        })
        .run();

      expect(
        db.get<
          Readonly<{
            dueAt: number;
            dueAtDefault: number;
          }>
        >(sql`SELECT dueAt, dueAtDefault FROM item WHERE id = ${itemId}`),
      ).toEqual({
        dueAt: 1787574896123,
        dueAtDefault: 1787574896123,
      });
      expect(
        db
          .select({
            dueAt: dbConfig.schema.item.dueAt,
            dueAtDefault: dbConfig.schema.item.dueAtDefault,
          })
          .from(dbConfig.schema.item)
          .where(eq(dbConfig.schema.item.id, itemId))
          .get(),
      ).toEqual({
        dueAt: dateWithMilliseconds,
        dueAtDefault: dateWithMilliseconds,
      });
    }).pipe(Effect.provide(AsyncLive)),
  );
});
