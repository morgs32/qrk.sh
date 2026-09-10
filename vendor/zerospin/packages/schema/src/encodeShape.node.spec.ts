import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  encodedShapeSchema,
  encodeShape,
  makeDrizzleSchemaFromEncodedTable,
  makeTable,
  PrimitiveKind,
  primitives,
  type IAnyShape,
} from './index.ts';

const teamTable = makeTable({
  name: 'team',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'team' }),
    name: primitives.text(),
  },
});

const numericBlockTable = makeTable({
  name: 'numericBlock',
  shape: {
    blockIndex: primitives.integer({ primaryKey: true }),
  },
});

const JsonSettingsSchema = Schema.Struct({
  compact: Schema.Boolean,
});

describe('encodeShape', () => {
  it('preserves scalar descriptors', () => {
    const name = primitives.text({ unique: true });
    const optionalName = primitives.text({
      nullable: true,
      defaultValue: null,
    });
    const count = primitives.integer({ defaultValue: 1 });

    const encoded = encodeShape({
      name,
      optionalName,
      count,
    });

    expect(encoded.name).toBe(name);
    expect(encoded.optionalName).toBe(optionalName);
    expect(encoded.optionalName.defaultValue).toBe(null);
    expect(encoded.count).toBe(count);
  });

  it('omits absent primary-key state from encoded descriptors', () => {
    const encoded = encodeShape({
      cursor: primitives.cursor({ abbreviation: 'cur' }),
      id: primitives.foreignKey({ abbreviation: 'item' }),
      primaryKey: primitives.primaryKey({ abbreviation: 'pk' }),
      text: primitives.text(),
    });

    expect('primaryKey' in encoded.cursor).toBe(false);
    expect('primaryKey' in encoded.id).toBe(false);
    expect('primaryKey' in encoded.primaryKey).toBe(false);
    expect('primaryKey' in encoded.text).toBe(false);
  });

  it('encodes json descriptors with a Draft 2020-12 JSON Schema document', () => {
    const settings = primitives.json({
      schema: JsonSettingsSchema,
    });

    const encoded = encodeShape({
      settings,
    });
    const encodedSettings = encoded.settings;

    expect(encodedSettings.kind).toBe(PrimitiveKind.Json);
    if (encodedSettings.kind !== PrimitiveKind.Json) {
      throw new Error('expected encoded json descriptor');
    }
    expect(encodedSettings.schema).toMatchObject({
      dialect: 'draft-2020-12',
      definitions: {},
      schema: {
        properties: {
          compact: {
            type: 'boolean',
          },
        },
        required: ['compact'],
        type: 'object',
      },
    });
  });

  it('omits the original Effect schema object from json descriptors', () => {
    const settings = primitives.json({
      nullable: true,
      schema: JsonSettingsSchema,
      defaultValue: null,
    });

    const encoded = encodeShape({
      settings,
    });
    const encodedSettings = encoded.settings;

    expect(encodedSettings.kind).toBe(PrimitiveKind.Json);
    if (encodedSettings.kind !== PrimitiveKind.Json) {
      throw new Error('expected encoded json descriptor');
    }
    expect(encodedSettings.schema).not.toBe(JsonSettingsSchema);
    expect(encodedSettings).toEqual(
      expect.objectContaining({
        defaultValue: null,
        kind: PrimitiveKind.Json,
        nullable: true,
      }),
    );
  });

  it('omits the runtime table object from ref descriptors', () => {
    const teamRef = primitives.ref({
      table: teamTable,
      relation: 'team',
      inverse: 'members',
    });

    const encoded = encodeShape({
      teamId: teamRef,
    });
    const encodedTeamRef = encoded.teamId;

    expect(encodedTeamRef.kind).toBe(PrimitiveKind.Ref);
    if (encodedTeamRef.kind !== PrimitiveKind.Ref) {
      throw new Error('expected encoded ref descriptor');
    }
    expect('table' in encodedTeamRef).toBe(false);
    expect('primaryKey' in encodedTeamRef).toBe(false);
    expect(Object.values(encodedTeamRef)).not.toContain(undefined);
    expect(encodedTeamRef).toEqual({
      abbreviation: 'team',
      inverse: 'members',
      kind: PrimitiveKind.Ref,
      nullable: false,
      relation: 'team',
      targetColumnName: 'id',
      targetTableName: 'team',
      unique: false,
    });
  });

  it('preserves numeric target metadata without the runtime table', () => {
    const encoded = encodeShape({
      blockIndex: primitives.ref({
        table: numericBlockTable,
        relation: 'block',
        inverse: 'commands',
      }),
    });

    expect(encoded.blockIndex).toEqual({
      abbreviation: '',
      inverse: 'commands',
      kind: PrimitiveKind.Ref,
      nullable: false,
      relation: 'block',
      targetColumnName: 'blockIndex',
      targetKind: PrimitiveKind.Integer,
      targetTableName: 'numericBlock',
      unique: false,
    });
  });

  it('encodes mixed shapes column-by-column', () => {
    const shape = {
      id: primitives.primaryKey({ abbreviation: 'item' }),
      settings: primitives.json({ schema: JsonSettingsSchema }),
      teamId: primitives.ref({
        table: teamTable,
        relation: 'team',
        inverse: 'items',
      }),
    } satisfies IAnyShape;

    const encoded = encodeShape(shape);

    expect(encoded.id).toBe(shape.id);
    expect(encoded.settings.kind).toBe(PrimitiveKind.Json);
    expect(encoded.teamId.kind).toBe(PrimitiveKind.Ref);
  });
});

it('round-trips every primitive as JSON, including date defaults and numeric refs', () => {
  const shape = {
    id: primitives.primaryKey({ abbreviation: 'row' }),
    foreignId: primitives.foreignKey({ abbreviation: 'usr' }),
    cursor: primitives.cursor({ abbreviation: 'cur' }),
    enabled: primitives.boolean({ defaultValue: true }),
    count: primitives.integer({ primaryKey: true }),
    amount: primitives.number({ defaultValue: 1.5 }),
    title: primitives.text({ nullable: true, defaultValue: null }),
    createdAt: primitives.date({
      defaultValue: new Date('2026-09-01T00:00:00.000Z'),
    }),
    status: primitives.enum({ values: ['open', 'closed'] }),
    settings: primitives.json({ schema: JsonSettingsSchema }),
    blockIndex: primitives.ref({
      table: numericBlockTable,
      relation: 'block',
      inverse: 'rows',
    }),
  };
  const encoded = encodeShape(shape);
  expect(
    Schema.decodeUnknownSync(encodedShapeSchema)(
      JSON.parse(JSON.stringify(encoded)),
    ),
  ).toEqual(encoded);
  const table = makeDrizzleSchemaFromEncodedTable({
    name: 'roundTrip',
    shape: encoded,
    indexes: [],
  });
  expect(
    getTableConfig(table).columns.find(column => column.name === 'createdAt')
      ?.default,
  ).toEqual(new Date('2026-09-01T00:00:00.000Z'));
  expect(encoded.createdAt).toEqual({
    kind: PrimitiveKind.Date,
    nullable: false,
    unique: false,
    defaultValue: '2026-09-01T00:00:00.000Z',
  });
  expect(encoded.blockIndex).not.toHaveProperty('table');
});

it('rejects malformed primitive metadata in serialized shapes', () => {
  expect(
    Schema.is(encodedShapeSchema)({
      dueAt: {
        kind: 'date',
        nullable: false,
        unique: false,
        defaultValue: 'invalid',
      },
    }),
  ).toBe(false);
  expect(
    Schema.is(encodedShapeSchema)({
      title: { kind: 'text', nullable: 'yes', unique: false },
    }),
  ).toBe(false);
  expect(
    Schema.is(encodedShapeSchema)({
      value: { kind: 'unsupported', nullable: false },
    }),
  ).toBe(false);
});
