import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  encodeShape,
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
      id: primitives.opaqueId({ abbreviation: 'item' }),
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
