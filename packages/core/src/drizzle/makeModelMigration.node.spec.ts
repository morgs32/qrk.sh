import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeModel } from '../models/makeModel.ts';
import { primitives } from '../models/primitives.ts';

import { makeTableMigrationSQL } from './makeTableMigrationSQL.ts';

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
      dueAtDefault: primitives.date({ defaultValue: new Date(0) }),
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

describe('makeTableMigrationSQL (models from makeModel)', () => {
  it('migrationSQL contains CREATE TABLE for the model table name', () => {
    expect(makeTableMigrationSQL(User.drizzleSchema)).toContain('CREATE TABLE');
    expect(makeTableMigrationSQL(User.drizzleSchema)).toContain('user');
  });

  it('migrationSQL includes metadata columns and custom attributes', () => {
    const sql = makeTableMigrationSQL(Item.drizzleSchema);

    expect(sql).toContain('CREATE TABLE item');
    expect(sql).toContain('id text PRIMARY KEY NOT NULL');
    expect(sql).toContain('modelName text NOT NULL');
    expect(sql).toContain('createdAt integer NOT NULL');
    expect(sql).toContain('updatedAt integer NOT NULL');
    expect(sql).toContain('version text NOT NULL');
    expect(sql).toContain('title text NOT NULL');
    expect(sql).toContain('userId text NOT NULL');
  });

  it('migrationSQL uses strict CREATE TABLE and does not include IF NOT EXISTS', () => {
    const sql = makeTableMigrationSQL(Item.drizzleSchema);

    expect(sql).toContain('CREATE TABLE item');
    expect(sql).not.toContain('IF NOT EXISTS');
  });

  it('migrationSQL omits NOT NULL for nullable property schemas', () => {
    const sql = makeTableMigrationSQL(Item.drizzleSchema);

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

  it('migrationSQL keeps table refs as text without SQLite references', () => {
    const sql = makeTableMigrationSQL(Item.drizzleSchema);

    expect(sql).toContain('userId text NOT NULL');
    expect(sql).toContain('userIdNullable text');
    expect(sql).not.toContain('REFERENCES');
  });

  it('migrationSQL includes expected built-in and custom column clauses', () => {
    const sql = makeTableMigrationSQL(Item.drizzleSchema);

    expect(sql).toContain('id text PRIMARY KEY NOT NULL');
    expect(sql).toContain('enabledDefault integer NOT NULL DEFAULT 1');
    expect(sql).toContain('count integer NOT NULL');
    expect(sql).toContain('countDefault integer NOT NULL DEFAULT 5');
    expect(sql).toContain('ratioDefault real NOT NULL DEFAULT 1.5');
    expect(sql).toContain('title text NOT NULL');
    expect(sql).toContain("titleDefault text NOT NULL DEFAULT 'it''s saved'");
    expect(sql).toContain('payloadDefault text DEFAULT NULL');
    expect(sql).toContain('dueAt integer NOT NULL');
    expect(sql).toContain('dueAtDefault integer NOT NULL DEFAULT 0');
    expect(sql).toContain('status text NOT NULL');
    expect(sql).toContain("statusDefault text NOT NULL DEFAULT 'todo'");
    expect(sql).toContain('userId text NOT NULL');
  });

  it('migrationSQL includes composite PRIMARY KEY from table-level primaryKey()', () => {
    const subscribers = sqliteTable(
      'subscribers',
      {
        serviceName: text().notNull(),
        name: text().notNull(),
      },
      table => [primaryKey({ columns: [table.serviceName, table.name] })],
    );
    const sql = makeTableMigrationSQL(subscribers);

    expect(sql).toContain('PRIMARY KEY (serviceName, name)');
    expect(sql).not.toContain('serviceName text PRIMARY KEY');
  });
});
