import { makeTable, primitives } from '@zerospin/schema';
import { getTableName } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/sql-js';
import initSqlJs from 'sql.js';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { defineModel } from '../../../models/defineModel.ts';
import { makeModelVersion } from '../../../models/make/makeModelVersion.ts';
import { makeReplica } from '../../../models/make/makeReplica.ts';

import { makeDbConfig, makeResourceDbConfig } from './makeDbConfig.ts';
import { makeTableProvisioningSQL } from '../../provisionDb/provisionDbTx/makeTableProvisioningSQL/makeTableProvisioningSQL.ts';

const parent = makeTable({
  name: 'parent',
  shape: { id: primitives.primaryKey({ abbreviation: 'par' }) },
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
