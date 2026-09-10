import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeTable, Table } from './makeTable.ts';
import { primitives } from './primitives.ts';

describe('makeTable ownership', () => {
  it('copies owned data while retaining opaque references', () => {
    const target = makeTable({
      name: 'target',
      shape: { id: primitives.primaryKey({ abbreviation: 'tgt' }) },
    });
    const values: [string, string] = ['open', 'closed'];
    const schema = Schema.Struct({ enabled: Schema.Boolean });
    const date = new Date('2026-09-07');
    const shape = {
      id: primitives.primaryKey({ abbreviation: 'src' }),
      status: primitives.enum({ values }),
      settings: primitives.json({ schema }),
      dueAt: primitives.date({ defaultValue: date }),
      targetId: primitives.ref({
        table: target,
        relation: 'target',
        inverse: 'sources',
      }),
    };
    const columns: ['status'] = ['status'];
    const indexes = [{ name: 'by-status', columns }];
    const table = makeTable({ name: 'source', shape, indexes });
    expect(table).toBeInstanceOf(Table);

    expect(table.shape).not.toBe(shape);
    expect(table.shape.status).not.toBe(shape.status);
    expect(table.shape.settings.schema).toBe(schema);
    expect(table.shape.dueAt.defaultValue).toBe(date);
    expect(table.shape.targetId.table).toBe(target);
    values[0] = 'changed';
    shape.status.unique = true;
    indexes[0]!.name = 'changed';
    columns.push('status');
    expect(table.shape.status.values).toEqual(['open', 'closed']);
    expect(table.shape.status.unique).toBe(false);
    expect(table.indexes).toEqual([{ name: 'by-status', columns: ['status'] }]);
  });

  it('resolves a reusable self marker separately for each table', () => {
    const shape = {
      id: primitives.primaryKey({ abbreviation: 'nod' }),
      parentId: primitives.self({
        relation: 'parent',
        inverse: 'children',
        nullable: true,
      }),
    };
    const first = makeTable({ name: 'first', shape });
    const second = new Table({ name: 'second', shape });
    expect(first.shape.parentId.table).toBe(first);
    expect(second.shape.parentId.table).toBe(second);
    expect(first.shape.parentId.targetTableName).toBe('first');
    expect(second.shape.parentId.targetTableName).toBe('second');
    expect('self' in first.shape.parentId).toBe(false);
  });

  it('rejects structural table objects at the ref boundary', () => {
    const structural = {
      name: 'fake',
      shape: { id: primitives.primaryKey({ abbreviation: 'fak' }) },
      indexes: [],
    };
    expect(() =>
      primitives.ref({
        // @ts-expect-error A structural object is not a nominal Table.
        table: structural,
        relation: 'fake',
        inverse: 'sources',
      }),
    ).toThrow('primitives.ref requires a Table instance from makeTable');
  });
});
