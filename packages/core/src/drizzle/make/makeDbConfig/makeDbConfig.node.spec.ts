import { makeTable, primitives } from '@zerospin/schema';
import { getTableName } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/sql-js';
import initSqlJs from 'sql.js';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { Effect, Schema } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { defineModel } from '../../../models/defineModel.ts';
import { makeModelVersion } from '../../../models/make/makeModelVersion.ts';
import { makeReplica } from '../../../models/make/makeReplica.ts';

import { makeDbConfig, makeResourceDbConfig } from './makeDbConfig.ts';
import { makeTableProvisioningSQL } from '../../provisionDb/provisionDbTx/makeTableProvisioningSQL/makeTableProvisioningSQL.ts';
import { makeTableProvisioningStatements } from '../../provisionDb/provisionDbTx/makeTableProvisioningSQL/makeTableProvisioningSQL.ts';
import { makeInMemorySQLite3 } from '../makeInMemorySQLite3/makeInMemorySQLite3.ts';
import { makeWaSqliteDrizzle } from '../makeProvisionedInMemoryWasmSqliteDb/makeInMemoryWasmSqliteDb/makeWaSqliteDrizzle/makeWaSqliteDrizzle.ts';
import { sessionRepoDbConfig } from '../../../aggregateSession/sessionRepoDbConfig.ts';
import type { IModelQueryDb } from '../../types.ts';

const parent = makeTable({
  name: 'parent',
  shape: { id: primitives.primaryKey({ abbreviation: 'par' }) },
});

describe('decoded relational columns', () => {
  const jsonItem = makeModelVersion(defineModel({ name: 'jsonItem', abbreviation: 'jsn' }), {
    version: '1.0.0',
    attributes: {
      payload: primitives.json({ schema: Schema.Struct({ count: Schema.Number }) }),
      tags: primitives.json({ schema: Schema.Array(Schema.String) }),
      optional: primitives.json({ schema: Schema.String, nullable: true }),
      date: primitives.json({ schema: Schema.DateFromString }),
    },
    indexes: [],
  });
  const jsonChild = makeModelVersion(defineModel({ name: 'jsonChild', abbreviation: 'jch' }), {
    version: '1.0.0',
    attributes: {
      itemId: primitives.ref({ table: jsonItem.table, relation: 'item', inverse: 'children' }),
      value: primitives.json({ schema: Schema.Array(Schema.Number) }),
    },
    indexes: [],
  });
  const date = new Date('2026-09-27T00:00:00.000Z');
  type AuthoredQuery = IModelQueryDb<{ jsonItem: typeof jsonItem }>;
  expectTypeOf<keyof AuthoredQuery['query']>().toEqualTypeOf<'jsonItem'>();
  // @ts-expect-error Internal tables are unavailable to authored callbacks.
  type _InternalQuery = AuthoredQuery['query']['commands'];
  // @ts-expect-error Unknown models are unavailable to authored callbacks.
  type _UnknownModel = AuthoredQuery['query']['missing'];
  // @ts-expect-error Authored callbacks cannot insert rows.
  type _MutationMethod = AuthoredQuery['insert'];

  it('decodes JSON in the model-only resource configuration', async () => {
    const config = makeResourceDbConfig({ models: { jsonItem } });
    const client = await makeInMemorySQLite3();
    try {
      const db = makeWaSqliteDrizzle(client, config);
      for (const statement of makeTableProvisioningStatements(config.schema.jsonItem)) client.sqlite3.exec(client.db, statement);
      db.insert(config.schema.jsonItem).values({
        id: 'jsn_one', modelName: 'jsonItem', version: '1.0.0', createdAt: date, updatedAt: date,
        payload: '{"count":2}', tags: '[]', optional: null, date: JSON.stringify(date.toISOString()),
      }).run();
      expect(db.query.jsonItem.findFirst({ where: { payload: { eq: { count: 2 } } } }).sync()?.payload).toEqual({ count: 2 });
      expect(db.select().from(config.schema.jsonItem).get()?.payload).toBe('{"count":2}');
    } finally {
      client.sqlite3.close(client.db);
    }
  });

  it('keeps decoded queries on the active wa-sqlite transaction and savepoint', async () => {
    const config = makeResourceDbConfig({ models: { jsonItem } });
    const client = await makeInMemorySQLite3();
    try {
      const db = makeWaSqliteDrizzle(client, config);
      for (const statement of makeTableProvisioningStatements(config.schema.jsonItem)) client.sqlite3.exec(client.db, statement);
      const changed: string[] = [];
      const unsubscribe = client.subscribeToTableChanges(tables => changed.push(...tables));
      try {
        db.transaction(tx => {
          tx.insert(config.schema.jsonItem).values({
            id: 'jsn_one', modelName: 'jsonItem', version: '1.0.0', createdAt: date, updatedAt: date,
            payload: '{"count":1}', tags: '[]', optional: null, date: JSON.stringify(date.toISOString()),
          }).run();
          expect(tx.query.jsonItem.findFirst().sync()?.payload).toEqual({ count: 1 });
          expect(() => tx.transaction(nested => {
            nested.update(config.schema.jsonItem).set({ payload: '{"count":2}' }).run();
            expect(nested.query.jsonItem.findFirst().sync()?.payload).toEqual({ count: 2 });
            throw new Error('savepoint rollback');
          })).toThrow('savepoint rollback');
          expect(tx.query.jsonItem.findFirst().sync()?.payload).toEqual({ count: 1 });
        });
        client.flushTableChanges();
        expect(changed).toContain('jsonItem');
        changed.length = 0;
        expect(() => db.transaction(tx => {
          tx.update(config.schema.jsonItem).set({ payload: '{"count":3}' }).run();
          expect(tx.query.jsonItem.findFirst().sync()?.payload).toEqual({ count: 3 });
          throw new Error('outer rollback');
        })).toThrow('outer rollback');
        client.flushTableChanges();
        expect(changed).toEqual([]);
        expect(db.query.jsonItem.findFirst().sync()?.payload).toEqual({ count: 1 });
      } finally {
        unsubscribe();
      }
    } finally {
      client.sqlite3.close(client.db);
    }
  });

  it('decodes full, partial, nested, and predicate values while explicit selects stay encoded', async () => {
    const config = makeResourceDbConfig({ models: { jsonItem, jsonChild }, otherTables: sessionRepoDbConfig.tables });
    const client = await makeInMemorySQLite3();
    try {
      const db = makeWaSqliteDrizzle(client, config);
      for (const table of Object.values(config.schema)) {
        for (const statement of makeTableProvisioningStatements(table)) client.sqlite3.exec(client.db, statement);
      }
      db.insert(config.schema.jsonItem).values({
        id: 'jsn_one', modelName: 'jsonItem', version: '1.0.0', createdAt: date, updatedAt: date,
        payload: '{"count":2}', tags: '["a","b"]', optional: null, date: JSON.stringify(date.toISOString()),
      }).run();
      db.insert(config.schema.jsonChild).values({
        id: 'jch_one', modelName: 'jsonChild', version: '1.0.0', createdAt: date, updatedAt: date,
        itemId: 'jsn_one', value: '[1,2]',
      }).run();
      const row = db.query.jsonItem.findFirst().sync();
      expect(row).toMatchObject({ payload: { count: 2 }, tags: ['a', 'b'], optional: null, date });
      expectTypeOf(row!.payload).toEqualTypeOf<{ readonly count: number }>();
      expectTypeOf(row!.date).toEqualTypeOf<Date>();
      expect(db.query.jsonItem.findMany({
        columns: { payload: true, date: true },
        where: { payload: { eq: { count: 2 } }, date: { eq: date } },
        with: { children: { columns: { value: true } } },
      }).sync()).toEqual([{ payload: { count: 2 }, date, children: [{ value: [1, 2] }] }]);
      expect(db.select().from(config.schema.jsonItem).get()?.payload).toBe('{"count":2}');
      expect(db.query.commands).toBeDefined();
      db.insert(config.schema.optimisticAppliedMutations).values({ commandId: 'cmd_one', mutations: '[]' }).run();
      expect(db.query.optimisticAppliedMutations.findFirst().sync()?.mutations).toEqual([]);
      expect(db.select().from(config.schema.optimisticAppliedMutations).get()?.mutations).toBe('[]');
      for (const payload of ['{broken', '{"count":"invalid"}']) {
        db.update(config.schema.jsonItem).set({ payload }).run();
        expect(() => db.query.jsonItem.findMany().sync()).toThrow();
        expect(db.query.jsonItem.findMany({ columns: { optional: true } }).sync()).toEqual([{ optional: null }]);
      }
    } finally {
      client.sqlite3.close(client.db);
    }
  });
});
const child = makeTable({
  name: 'child',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'chi' }),
    parentId: primitives.ref({ table: parent, relation: 'parent', inverse: 'children' }),
  },
  indexes: [{ name: 'child_parent', columns: ['parentId'] }],
});
const item = makeModelVersion(defineModel({ name: 'item', abbreviation: 'itm' }), {
  version: '1.0.0',
  attributes: { title: primitives.text() },
  indexes: [],
});

describe('database config tables', () => {
  it('preserves table instances, physical names, indexes, and relations', () => {
    const config = makeDbConfig({
      tables: { parent, child },
      physicalTableNames: { child: 'renamed_child' },
    });
    expect(config.tables.parent).toBe(parent);
    expect(config.tables.child).toBe(child);
    expect(getTableName(config.schema.child)).toBe('renamed_child');
    expect(config.tables.child.indexes[0]?.name).toBe('child_parent');
    expect(config.relations.child.relations.parent).toBeDefined();
    expect(config.relations.parent.relations.children).toBeDefined();
    expect(Effect.runSync(config.tables.child.decodeRow({ id: 'chi_one', parentId: 'par_one' }))).toEqual({
      id: 'chi_one', parentId: 'par_one',
    });
    expectTypeOf(config.tables.child).toEqualTypeOf<typeof child>();
  });

  it('types model tables in both resource-config paths', () => {
    const ordinary = makeResourceDbConfig({ models: { item } });
    const withOther = makeResourceDbConfig({
      models: { item },
      otherTables: { child, parent },
    });
    expect(ordinary.tables.item).toBe(item.table);
    expect(withOther.tables.item).toBe(item.table);
    expect(withOther.tables.child).toBe(child);
    expectTypeOf(ordinary.tables.item).toEqualTypeOf<typeof item.table>();
    expectTypeOf(withOther.tables.child).toEqualTypeOf<typeof child>();
  });

  it('resolves a source-model reference through the replica table alias', () => {
    const replica = makeReplica({
      sourceModel: item,
      serviceName: 'inventory',
      serviceVersion: '1.0.0',
    });
    const related = makeTable({
      name: 'related',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'rel' }),
        itemId: primitives.ref({
          table: item.table,
          relation: 'item',
          inverse: 'related',
        }),
      },
    });
    const config = makeResourceDbConfig({
      models: { item: replica },
      otherTables: { related },
    });
    expect(config.tables.item).toBe(replica.table);
    expect(config.relations.related.relations.item).toBeDefined();
    expect(config.relations.item.relations.related).toBeDefined();
  });
});

describe('config-local references', () => {
  it('resolves forward references to owned tables with inferred string and integer codecs', async () => {
    const config = makeDbConfig({
      tables: {
        pending: makeTable({
          name: 'pending',
          shape: {
            commandRowId: primitives.ref({ table: 'commands', column: 'rowId', relation: 'command', inverse: 'pending', unique: true }),
          },
        }),
        runs: makeTable({
          name: 'runs',
          shape: {
            sourceIndex: primitives.ref({ table: 'groups', column: 'sourceIndex', relation: 'group', inverse: 'runs' }),
            outputCommandRowId: primitives.ref({ table: 'commands', column: 'rowId', relation: 'output', inverse: 'runs', nullable: true }),
          },
        }),
        commands: makeTable({ name: 'commands', shape: { rowId: primitives.primaryKey({ abbreviation: 'row' }) } }),
        groups: makeTable({ name: 'groups', shape: { sourceIndex: primitives.integer({ primaryKey: true }) } }),
      },
      physicalTableNames: { commands: 'stored_commands', groups: 'stored_groups' },
    });
    expect(config.tables.pending.shape.commandRowId.table).toBe(config.tables.commands);
    expect(config.tables.runs.shape.sourceIndex.table).toBe(config.tables.groups);
    expect(config.tables.runs.shape.outputCommandRowId.table).toBe(config.tables.commands);
    expect(Effect.runSync(config.tables.pending.decodeRow({ commandRowId: 'row_one' }))).toEqual({ commandRowId: 'row_one' });
    expect(Effect.runSync(config.tables.runs.decodeRow({ sourceIndex: 7, outputCommandRowId: null }))).toEqual({ sourceIndex: 7, outputCommandRowId: null });
    expect(() => Effect.runSync(config.tables.runs.decodeRow({ sourceIndex: '7', outputCommandRowId: null }))).toThrow();
    expect(() => Effect.runSync(config.tables.pending.decodeRow({ commandRowId: 'wrong_one' }))).toThrow();
    expectTypeOf<typeof config.tables.pending.codec.Type.commandRowId>().toEqualTypeOf<`row_${string}`>();
    expectTypeOf<typeof config.tables.runs.codec.Type.sourceIndex>().toEqualTypeOf<number>();
    expectTypeOf<typeof config.tables.runs.codec.Type.outputCommandRowId>().toEqualTypeOf<`row_${string}` | null>();
    expectTypeOf<typeof config.schema.runs.$inferSelect>().toEqualTypeOf<{ sourceIndex: number; outputCommandRowId: `row_${string}` | null }>();
    expect(config.relations.pending.relations.command).toBeDefined();
    expect(config.relations.commands.relations.pending).toBeDefined();
    expect(config.relations.runs.relations.group).toBeDefined();
    expect(config.relations.groups.relations.runs).toBeDefined();
    expect(config.relations.runs.relations.output).toBeDefined();
    expect(config.relations.commands.relations.runs).toBeDefined();
    const references = [config.schema.pending, config.schema.runs].flatMap(table =>
      getTableConfig(table).foreignKeys.map(key => {
        const ref = key.reference();
        return { from: ref.columns.map(column => column.name), to: getTableName(ref.foreignTable), columns: ref.foreignColumns.map(column => column.name) };
      }),
    );
    expect(references).toEqual([
      { from: ['commandRowId'], to: 'stored_commands', columns: ['rowId'] },
      { from: ['sourceIndex'], to: 'stored_groups', columns: ['sourceIndex'] },
      { from: ['outputCommandRowId'], to: 'stored_commands', columns: ['rowId'] },
    ]);
    const SQL = await initSqlJs();
    const client = new SQL.Database();
    try {
      client.run('PRAGMA foreign_keys = ON');
      for (const table of Object.values(config.schema)) client.run(makeTableProvisioningSQL(table));
      client.run("INSERT INTO stored_commands VALUES ('row_one')");
      client.run('INSERT INTO stored_groups VALUES (7)');
      expect(() => client.run("INSERT INTO pending VALUES ('row_missing')")).toThrow(/FOREIGN KEY/);
      expect(() => client.run('INSERT INTO runs VALUES (8, NULL)')).toThrow(/FOREIGN KEY/);
      expect(() => client.run("INSERT INTO runs VALUES (7, 'row_missing')")).toThrow(/FOREIGN KEY/);
      client.run("INSERT INTO pending VALUES ('row_one')");
      client.run('INSERT INTO runs VALUES (7, NULL)');
      client.run("INSERT INTO runs VALUES (7, 'row_one')");
      const db = drizzle(client, { relations: config.relations });
      expect(db.query.pending.findFirst({ with: { command: true } }).sync()).toEqual({ commandRowId: 'row_one', command: { rowId: 'row_one' } });
      expect(db.query.groups.findFirst({ with: { runs: true } }).sync()).toEqual({ sourceIndex: 7, runs: [{ sourceIndex: 7, outputCommandRowId: null }, { sourceIndex: 7, outputCommandRowId: 'row_one' }] });
    } finally {
      client.close();
    }

  });

  it('rejects unknown sibling names at construction and in the type contract', () => {
    expect(() => makeDbConfig({
      // @ts-expect-error unknown sibling table
      tables: { child: makeTable({ name: 'child', shape: { parentId: primitives.ref({ table: 'missing', column: 'id', relation: 'parent', inverse: 'children' }) } }) },
    })).toThrow('Unknown reference table missing');
  });

  it('rejects a missing or non-primary target column', () => {
    const configTables = {
      parent: makeTable({ name: 'parent', shape: { rowId: primitives.primaryKey({ abbreviation: 'par' }), other: primitives.text() } }),
      child: makeTable({ name: 'child', shape: { parentId: primitives.ref({ table: 'parent', column: 'other', relation: 'parent', inverse: 'children' }) } }),
    };
    expect(() => makeDbConfig({
      // @ts-expect-error the named column is not the primary key
      tables: configTables,
    })).toThrow('must be its primary key');
    expect(() => makeDbConfig({
      // @ts-expect-error the column does not exist
      tables: { parent: configTables.parent, child: makeTable({ name: 'child', shape: { parentId: primitives.ref({ table: 'parent', column: 'missing', relation: 'parent', inverse: 'children' }) } }) },
    })).toThrow('must be its primary key');
  });

  it('refuses a codec before resolution and preserves table identity when configured', () => {
    const child = makeTable({ name: 'child', shape: { parentId: primitives.ref({ table: 'parent', column: 'id', relation: 'parent', inverse: 'children' }) } });
    expect(() => child.codec).toThrow('construct its owning makeDbConfig first');
    const config = makeDbConfig({ tables: { child, parent } });
    expect(config.tables.child).toBe(child);
    expect(config.tables.child.shape.parentId.table).toBe(parent);
    expect(Effect.runSync(config.tables.child.decodeRow({ parentId: 'par_one' }))).toEqual({ parentId: 'par_one' });
    expect(() => makeResourceDbConfig({ models: {}, otherTables: config.tables })).not.toThrow();
  });
});
