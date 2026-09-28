import { primitives } from '@zerospin/schema';
import { Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';

import { defineModel } from '../../models/defineModel.ts';
import { makeModelVersion } from '../../models/make/makeModelVersion.ts';
import { makeTableProvisioningStatements } from '../provisionDb/provisionDbTx/makeTableProvisioningSQL/makeTableProvisioningSQL.ts';
import { makeResourceDbConfig } from './makeDbConfig/makeDbConfig.ts';
import { makeInMemorySQLite3 } from './makeInMemorySQLite3/makeInMemorySQLite3.ts';
import { makeWaSqliteDrizzle } from './makeProvisionedInMemoryWasmSqliteDb/makeInMemoryWasmSqliteDb/makeWaSqliteDrizzle/makeWaSqliteDrizzle.ts';
import { makeSessionQueryDb } from './makeSessionQueryDb.ts';

const item = makeModelVersion(defineModel({ name: 'item', abbreviation: 'itm' }), {
  version: '1.0.0',
  attributes: {
    payload: primitives.json({ schema: Schema.Struct({ count: Schema.Number }) }),
    tags: primitives.json({ schema: Schema.Array(Schema.String) }),
    label: primitives.json({ schema: Schema.String }),
    optional: primitives.json({ schema: Schema.String, nullable: true }),
    date: primitives.json({ schema: Schema.DateFromString }),
  },
  indexes: [],
});
const child = makeModelVersion(defineModel({ name: 'child', abbreviation: 'chi' }), {
  version: '1.0.0',
  attributes: {
    itemId: primitives.ref({ table: item.table, relation: 'item', inverse: 'children' }),
    value: primitives.json({ schema: Schema.Array(Schema.Number) }),
  },
  indexes: [],
});
const models = { item, child };
const config = makeResourceDbConfig({ models });
let client: Awaited<ReturnType<typeof makeInMemorySQLite3>>;
let db: ReturnType<typeof makeWaSqliteDrizzle<typeof config>>;
let queryDb: ReturnType<typeof makeSessionQueryDb<typeof models>>;
const date = new Date('2026-09-27T00:00:00.000Z');

beforeEach(async () => {
  client = await makeInMemorySQLite3();
  db = makeWaSqliteDrizzle(client, config);
  for (const table of Object.values(config.schema)) {
    for (const statement of makeTableProvisioningStatements(table)) client.sqlite3.exec(client.db, statement);
  }
  queryDb = makeSessionQueryDb({ models, client });
  db.insert(config.schema.item).values({
    id: 'itm_one', modelName: 'item', version: '1.0.0', createdAt: date, updatedAt: date,
    payload: '{"count":2}', tags: '["a","b"]', label: '"hello"', optional: null,
    date: JSON.stringify(date.toISOString()),
  }).run();
  db.insert(config.schema.child).values({
    id: 'chi_one', modelName: 'child', version: '1.0.0', createdAt: date, updatedAt: date,
    itemId: 'itm_one', value: '[1,2]',
  }).run();
});
afterEach(() => client.sqlite3.close(client.db));

describe('decoded session queries', () => {
  it('decodes model values and preserves storage columns and the shared connection', () => {
    const row = queryDb.query.item.findFirst().sync();
    expect(row).toMatchObject({ payload: { count: 2 }, tags: ['a', 'b'], label: 'hello', optional: null, date });
    expectTypeOf(row!.payload).toEqualTypeOf<{ readonly count: number }>();
    expectTypeOf(row!.date).toEqualTypeOf<Date>();
    expectTypeOf(row!.optional).toEqualTypeOf<string | null>();
    expect(queryDb.$client).toBe(db.$client);
    expect(Object.keys(queryDb).sort()).toEqual(['$client', 'query']);
    expect(Object.keys(queryDb.query).sort()).toEqual(['child', 'item']);
    expect(db.query.item.findFirst().sync()?.payload).toBe('{"count":2}');
    expect(db.select().from(config.schema.item).all()[0]?.date).toBe(JSON.stringify(date.toISOString()));
  });

  it('decodes projections and nested relations and encodes JSON predicates', () => {
    const rows = queryDb.query.item.findMany({
      columns: { payload: true, date: true },
      where: { payload: { eq: { count: 2 } }, date: { eq: date } },
      with: { children: { columns: { value: true } } },
    }).sync();
    expect(rows).toEqual([{ payload: { count: 2 }, date, children: [{ value: [1, 2] }] }]);
    expectTypeOf(rows[0]!.children[0]!.value).toEqualTypeOf<readonly number[]>();
    expect(queryDb.query.child.findFirst({ with: { item: true } }).sync()?.item.payload).toEqual({ count: 2 });
  });

  it('shares notifications for encoded writes without double encoding', () => {
    const changed: string[] = [];
    const unsubscribe = queryDb.$client.subscribeToTableChanges(tables => changed.push(...tables));
    try {
      db.update(config.schema.item).set({ payload: '{"count":3}', optional: '"present"' }).run();
      client.flushTableChanges();
      expect(changed).toContain('item');
      expect(queryDb.query.item.findFirst().sync()).toMatchObject({ payload: { count: 3 }, optional: 'present' });
      expect(db.query.item.findFirst().sync()?.payload).toBe('{"count":3}');
    } finally { unsubscribe(); }
  });

  it('rejects malformed JSON and schema-invalid values instead of returning raw rows', () => {
    for (const payload of ['{broken', '{"count":"invalid"}']) {
      db.update(config.schema.item).set({ payload }).run();
      expect(() => queryDb.query.item.findMany().sync()).toThrow();
      expect(queryDb.query.item.findMany({ columns: { label: true } }).sync()).toEqual([{ label: 'hello' }]);
    }
  });
});
