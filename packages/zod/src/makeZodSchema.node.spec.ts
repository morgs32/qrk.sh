import { makeTable, primitives } from '@zerospin/schema';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { descriptorToZod, makeZodSchema } from './makeZodSchema.ts';

const TinyJsonRowSchema = Schema.Struct({ x: Schema.String });
const tinyJsonColumn = primitives.json({ schema: TinyJsonRowSchema });
const nullableTinyJsonColumn = primitives.json({
  nullable: true,
  schema: TinyJsonRowSchema,
});
const nullableTinyJsonDefaultColumn = primitives.json({
  nullable: true,
  schema: TinyJsonRowSchema,
  defaultValue: null,
});

const userTable = makeTable({
  name: 'users',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'usr' }),
  },
});

const integerPkTable = makeTable({
  name: 'counters',
  shape: {
    id: primitives.integer({ primaryKey: true }),
  },
});

describe('descriptorToZod', () => {
  it('supports boolean primitives', () => {
    const schema = descriptorToZod(primitives.boolean());
    expect(schema.safeParse(true).success).toBe(true);
    expect(schema.safeParse(1).success).toBe(false);
  });

  it('requires abbreviation-prefixed foreign keys', () => {
    const schema = descriptorToZod(
      primitives.foreignKey({ abbreviation: 'act' }),
    );
    expect(schema.safeParse('act_ok').success).toBe(true);
    expect(schema.safeParse('other_ok').success).toBe(false);
    expect(schema.safeParse(null).success).toBe(false);
  });

  it('accepts null only when nullable', () => {
    const schema = descriptorToZod(
      primitives.foreignKey({ nullable: true, abbreviation: 'act' }),
    );
    expect(schema.safeParse(null).success).toBe(true);
    expect(schema.safeParse('act_ok').success).toBe(true);
    expect(schema.safeParse('any').success).toBe(false);
  });

  it('maps integer refs to numbers', () => {
    const schema = descriptorToZod(
      primitives.ref({
        table: integerPkTable,
        relation: 'counter',
        inverse: 'rows',
      }),
    );
    expect(schema.safeParse(42).success).toBe(true);
    expect(schema.safeParse('usr_1').success).toBe(false);
  });

  it('maps string refs to abbreviation-prefixed ids', () => {
    const schema = descriptorToZod(
      primitives.ref({
        table: userTable,
        relation: 'user',
        inverse: 'rows',
      }),
    );
    expect(schema.safeParse('usr_1').success).toBe(true);
    expect(schema.safeParse('other_1').success).toBe(false);
  });

  it('validates json domain objects, not wire strings', () => {
    const schema = descriptorToZod(tinyJsonColumn);
    expect(schema.safeParse({ x: 'ok' }).success).toBe(true);
    expect(schema.safeParse(JSON.stringify({ x: 'ok' })).success).toBe(false);
    expect(schema.safeParse({ x: 1 }).success).toBe(false);
  });
});

describe('makeZodSchema', () => {
  it('returns a Zod object schema for decoded rows', () => {
    const schema = makeZodSchema({
      id: primitives.primaryKey({ abbreviation: 'item' }),
      name: primitives.text(),
    });

    expect(schema.parse({ id: 'item_supplied', name: 'Ada' })).toEqual({
      id: 'item_supplied',
      name: 'Ada',
    });
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ id: 'other_1', name: 'Ada' }).success).toBe(
      false,
    );
  });

  it('fills missing scalar default values during shape parse', () => {
    const defaultDate = new Date(0);
    const providedDate = new Date(1000);
    const schema = makeZodSchema({
      flag: primitives.boolean({ defaultValue: true }),
      count: primitives.integer({ defaultValue: 5 }),
      ratio: primitives.number({ defaultValue: 1.5 }),
      name: primitives.text({ defaultValue: 'saved' }),
      createdAt: primitives.date({ defaultValue: defaultDate }),
      status: primitives.enum({
        values: ['open', 'closed'],
        defaultValue: 'open',
      }),
    });

    expect(schema.parse({})).toEqual({
      flag: true,
      count: 5,
      ratio: 1.5,
      name: 'saved',
      createdAt: defaultDate,
      status: 'open',
    });
    expect(
      schema.parse({
        flag: false,
        count: 7,
        ratio: 2.5,
        name: 'provided',
        createdAt: providedDate,
        status: 'closed',
      }),
    ).toEqual({
      flag: false,
      count: 7,
      ratio: 2.5,
      name: 'provided',
      createdAt: providedDate,
      status: 'closed',
    });
  });

  it('allows null for nullable scalar default values', () => {
    const defaultDate = new Date(0);
    const schema = makeZodSchema({
      flag: primitives.boolean({ nullable: true, defaultValue: true }),
      count: primitives.integer({ nullable: true, defaultValue: 5 }),
      ratio: primitives.number({ nullable: true, defaultValue: 1.5 }),
      name: primitives.text({ nullable: true, defaultValue: 'saved' }),
      createdAt: primitives.date({ nullable: true, defaultValue: defaultDate }),
      status: primitives.enum({
        values: ['open', 'closed'],
        nullable: true,
        defaultValue: 'open',
      }),
    });

    expect(schema.parse({})).toEqual({
      flag: true,
      count: 5,
      ratio: 1.5,
      name: 'saved',
      createdAt: defaultDate,
      status: 'open',
    });
    expect(
      schema.parse({
        flag: null,
        count: null,
        ratio: null,
        name: null,
        createdAt: null,
        status: null,
      }),
    ).toEqual({
      flag: null,
      count: null,
      ratio: null,
      name: null,
      createdAt: null,
      status: null,
    });
  });

  it('fills missing nullable json null defaults during shape parse', () => {
    const schema = makeZodSchema({
      payload: nullableTinyJsonDefaultColumn,
    });

    expect(schema.parse({})).toEqual({ payload: null });
    expect(schema.parse({ payload: { x: 'ok' } })).toEqual({
      payload: { x: 'ok' },
    });
    expect(schema.parse({ payload: null })).toEqual({ payload: null });
  });

  it('round-trips decoded json columns through makeZodSchema', () => {
    const schema = makeZodSchema({
      flag: primitives.boolean(),
      maybeJson: nullableTinyJsonColumn,
    });
    const domainRow = {
      flag: true,
      maybeJson: { x: 'ok' },
    };

    expect(schema.parse(domainRow)).toEqual(domainRow);
    expect(schema.parse({ flag: true, maybeJson: null })).toEqual({
      flag: true,
      maybeJson: null,
    });
  });
});
