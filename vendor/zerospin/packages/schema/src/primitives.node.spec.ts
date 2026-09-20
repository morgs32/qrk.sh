import { Result, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  descriptorToEffectSchema,
  encodeShape,
  makeTable,
  PrimitiveKind,
  primitives,
} from './index.ts';

const userTable = makeTable({
  name: 'user',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'usr' }),
    name: primitives.text(),
  },
});

const numericBlockTable = makeTable({
  name: 'numericBlock',
  shape: {
    blockIndex: primitives.integer({ primaryKey: true }),
  },
});

const TinyJsonRowSchema = Schema.Struct({ x: Schema.String });

const nullableTinyJsonDefaultColumn = primitives.json({
  nullable: true,
  schema: TinyJsonRowSchema,
  defaultValue: null,
});

describe('primitives.ref', () => {
  it('stores the concrete target table and stable relation metadata', () => {
    const descriptor = primitives.ref({
      table: userTable,
      relation: 'user',
      inverse: 'lists',
    });

    expect(descriptor).toEqual({
      kind: PrimitiveKind.Ref,
      abbreviation: 'usr',
      nullable: false,
      unique: false,
      table: userTable,
      targetTableName: 'user',
      targetColumnName: 'id',
      relation: 'user',
      inverse: 'lists',
    });
  });

  it('preserves nullable and unique without caller-supplied inverse kind', () => {
    expect(
      primitives.ref({
        table: userTable,
        relation: 'user',
        inverse: 'profile',
        nullable: true,
        unique: true,
      }),
    ).toEqual({
      kind: PrimitiveKind.Ref,
      abbreviation: 'usr',
      nullable: true,
      unique: true,
      table: userTable,
      targetTableName: 'user',
      targetColumnName: 'id',
      relation: 'user',
      inverse: 'profile',
    });
  });

  it('targets an integer primary key without changing prefixed-ID refs', () => {
    const descriptor = primitives.ref({
      table: numericBlockTable,
      relation: 'block',
      inverse: 'commands',
    });

    expect(descriptor).toEqual({
      kind: PrimitiveKind.Ref,
      abbreviation: '',
      targetKind: PrimitiveKind.Integer,
      nullable: false,
      unique: false,
      table: numericBlockTable,
      targetTableName: 'numericBlock',
      targetColumnName: 'blockIndex',
      relation: 'block',
      inverse: 'commands',
    });
    expect(
      primitives.ref({
        table: userTable,
        relation: 'user',
        inverse: 'records',
      }),
    ).not.toHaveProperty('targetKind');
  });

  it('maps integer refs to number schemas', () => {
    const schema = descriptorToEffectSchema(
      primitives.ref({
        table: numericBlockTable,
        relation: 'block',
        inverse: 'commands',
      }),
    );

    expect(Schema.decodeUnknownSync(schema)(7)).toBe(7);
    expect(Result.isFailure(Schema.decodeUnknownResult(schema)('7'))).toBe(
      true,
    );
  });

  it('requires non-empty forward and inverse relation names', () => {
    expect(() =>
      primitives.ref({
        table: userTable,
        // @ts-expect-error relation names must be non-empty
        relation: '',
        inverse: 'lists',
      }),
    ).toThrow('primitives.ref requires a non-empty `relation`');

    expect(() =>
      primitives.ref({
        table: userTable,
        relation: 'user',
        // @ts-expect-error inverse names must be non-empty
        inverse: '',
      }),
    ).toThrow('primitives.ref requires a non-empty `inverse`');
  });

  it('requires the target table to have exactly one primary key', () => {
    const noPrimaryKeyTable = makeTable({
      name: 'noPrimaryKey',
      shape: {
        name: primitives.text(),
      },
    });
    const multiplePrimaryKeysTable = makeTable({
      name: 'multiplePrimaryKeys',
      shape: {
        firstId: primitives.primaryKey({ abbreviation: 'fst' }),
        secondId: primitives.primaryKey({ abbreviation: 'snd' }),
      },
    });
    const mixedPrimaryKeysTable = makeTable({
      name: 'mixedPrimaryKeys',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'mixed' }),
        index: primitives.integer({ primaryKey: true }),
      },
    });

    expect(() =>
      primitives.ref({
        // @ts-expect-error ref targets require one primary key
        table: noPrimaryKeyTable,
        relation: 'target',
        inverse: 'sources',
      }),
    ).toThrow(
      'primitives.ref target table "noPrimaryKey" must have one primary key',
    );
    expect(() =>
      primitives.ref({
        // @ts-expect-error ref targets cannot have multiple primary keys
        table: multiplePrimaryKeysTable,
        relation: 'target',
        inverse: 'sources',
      }),
    ).toThrow(
      'primitives.ref target table "multiplePrimaryKeys" must have only one primary key',
    );
    expect(() =>
      primitives.ref({
        // @ts-expect-error ref targets cannot mix string and integer primary keys
        table: mixedPrimaryKeysTable,
        relation: 'target',
        inverse: 'sources',
      }),
    ).toThrow(
      'primitives.ref target table "mixedPrimaryKeys" must have only one primary key',
    );
  });
});

describe('primitives.self', () => {
  it('resolves the current table and its sole primary key', () => {
    const categories = makeTable({
      name: 'categories',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'cat' }),
        parentCategoryId: primitives.self({
          relation: 'parentCategory',
          inverse: 'childCategories',
          nullable: true,
          unique: true,
        }),
      },
    });

    const descriptor = categories.shape.parentCategoryId;
    expect(descriptor).toEqual({
      kind: PrimitiveKind.Ref,
      abbreviation: 'cat',
      nullable: true,
      unique: true,
      table: categories,
      targetTableName: 'categories',
      targetColumnName: 'id',
      relation: 'parentCategory',
      inverse: 'childCategories',
    });
    expect('self' in descriptor).toBe(false);
    expect(encodeShape(categories.shape).parentCategoryId).toEqual({
      kind: PrimitiveKind.Ref,
      abbreviation: 'cat',
      nullable: true,
      unique: true,
      targetTableName: 'categories',
      targetColumnName: 'id',
      relation: 'parentCategory',
      inverse: 'childCategories',
    });
  });

  it('requires non-empty forward and inverse relation names', () => {
    expect(() =>
      primitives.self({
        // @ts-expect-error relation names must be non-empty
        relation: '',
        inverse: 'children',
      }),
    ).toThrow('primitives.self requires a non-empty `relation`');

    expect(() =>
      primitives.self({
        relation: 'parent',
        // @ts-expect-error inverse names must be non-empty
        inverse: '',
      }),
    ).toThrow('primitives.self requires a non-empty `inverse`');
  });

  it('requires the current table to have exactly one primary key', () => {
    expect(() =>
      makeTable({
        name: 'noPrimaryKey',
        shape: {
          parentId: primitives.self({
            relation: 'parent',
            inverse: 'children',
          }),
        },
      }),
    ).toThrow('primitives.self table "noPrimaryKey" must have one primary key');

    expect(() =>
      makeTable({
        name: 'multiplePrimaryKeys',
        shape: {
          firstId: primitives.primaryKey({ abbreviation: 'fst' }),
          secondId: primitives.primaryKey({ abbreviation: 'snd' }),
          parentId: primitives.self({
            relation: 'parent',
            inverse: 'children',
          }),
        },
      }),
    ).toThrow(
      'primitives.self table "multiplePrimaryKeys" must have only one primary key',
    );
  });
});

describe('primitives.primaryKey', () => {
  it('is always non-null, unique, and primary-key kind', () => {
    expect(primitives.primaryKey({ abbreviation: 'usr' })).toEqual({
      kind: PrimitiveKind.PrimaryKey,
      abbreviation: 'usr',
      nullable: false,
      unique: true,
    });
  });

  it('requires a non-empty abbreviation', () => {
    expect(() => primitives.primaryKey({ abbreviation: '' })).toThrow(
      'primitives.primaryKey requires a non-empty `abbreviation`',
    );
  });

  it('decodes only values with the primary-key abbreviation prefix', () => {
    const schema = descriptorToEffectSchema(
      primitives.primaryKey({ abbreviation: 'usr' }),
    );

    expect(
      Result.isFailure(Schema.decodeUnknownResult(schema)('wrong_1')),
    ).toBe(true);
    expect(Result.isSuccess(Schema.decodeUnknownResult(schema)('usr_1'))).toBe(
      true,
    );
  });
});

describe('primitives.cursor', () => {
  it('preserves abbreviation and cursor kind at runtime', () => {
    expect(
      primitives.cursor({
        abbreviation: '1ab',
      }),
    ).toEqual(
      expect.objectContaining({
        kind: PrimitiveKind.Cursor,
        abbreviation: '1ab',
      }),
    );
    expect(
      primitives.cursor({
        abbreviation: 'usr',
      }),
    ).toEqual(
      expect.objectContaining({
        kind: PrimitiveKind.Cursor,
        abbreviation: 'usr',
      }),
    );
  });

  it('requires a non-empty abbreviation', () => {
    expect(() => primitives.cursor({ abbreviation: '' })).toThrow(
      'primitives.cursor requires a non-empty `abbreviation`',
    );
  });

  it('preserves nullable and unique cursor properties', () => {
    expect(
      primitives.cursor({
        abbreviation: 'cur',
        nullable: true,
        unique: true,
      }),
    ).toEqual({
      kind: PrimitiveKind.Cursor,
      abbreviation: 'cur',
      nullable: true,
      unique: true,
    });
  });

  it('decodes only values with the cursor abbreviation prefix', () => {
    const schema = descriptorToEffectSchema(
      primitives.cursor({ abbreviation: 'cur' }),
    );

    expect(
      Result.isFailure(Schema.decodeUnknownResult(schema)('wrong_1')),
    ).toBe(true);
    expect(Result.isSuccess(Schema.decodeUnknownResult(schema)('cur_1'))).toBe(
      true,
    );
  });

  it('accepts null for nullable cursors', () => {
    const schema = descriptorToEffectSchema(
      primitives.cursor({ abbreviation: 'cur', nullable: true }),
    );

    expect(Result.isSuccess(Schema.decodeUnknownResult(schema)(null))).toBe(
      true,
    );
    expect(Result.isSuccess(Schema.decodeUnknownResult(schema)('cur_1'))).toBe(
      true,
    );
  });
});

describe('primitives.json', () => {
  it('stores nullable null defaultValue at runtime', () => {
    expect(nullableTinyJsonDefaultColumn).toEqual(
      expect.objectContaining({
        kind: PrimitiveKind.Json,
        nullable: true,
        defaultValue: null,
      }),
    );
  });
});

describe('scalar primitive defaults', () => {
  it('stores defaultValue at runtime', () => {
    const defaultDate = new Date(0);

    expect(primitives.boolean({ defaultValue: true })).toEqual(
      expect.objectContaining({
        kind: PrimitiveKind.Boolean,
        nullable: false,
        unique: false,
        defaultValue: true,
      }),
    );
    expect(primitives.integer({ defaultValue: 5 })).toEqual(
      expect.objectContaining({
        kind: PrimitiveKind.Integer,
        nullable: false,
        unique: false,
        defaultValue: 5,
      }),
    );
    expect(primitives.number({ defaultValue: 1.5 })).toEqual(
      expect.objectContaining({
        kind: PrimitiveKind.Number,
        nullable: false,
        unique: false,
        defaultValue: 1.5,
      }),
    );
    expect(primitives.text({ defaultValue: 'hello' })).toEqual(
      expect.objectContaining({
        kind: PrimitiveKind.Text,
        nullable: false,
        unique: false,
        defaultValue: 'hello',
      }),
    );
    expect(primitives.date({ defaultValue: defaultDate })).toEqual(
      expect.objectContaining({
        kind: PrimitiveKind.Date,
        nullable: false,
        unique: false,
        defaultValue: defaultDate,
      }),
    );
    expect(
      primitives.enum({ values: ['open', 'closed'], defaultValue: 'open' }),
    ).toEqual(
      expect.objectContaining({
        kind: PrimitiveKind.Enum,
        nullable: false,
        unique: false,
        defaultValue: 'open',
      }),
    );
  });
});

describe('primitives.foreignKey', () => {
  it('preserves abbreviation, nullability, and uniqueness', () => {
    expect(
      primitives.foreignKey({
        abbreviation: 'act',
        nullable: true,
        unique: true,
      }),
    ).toEqual({
      kind: PrimitiveKind.ForeignKey,
      abbreviation: 'act',
      nullable: true,
      unique: true,
    });
  });

  it('requires a non-empty abbreviation', () => {
    expect(() => primitives.foreignKey({ abbreviation: '' })).toThrow(
      'primitives.foreignKey requires a non-empty `abbreviation`',
    );
  });

  it('requires an abbreviation-prefixed value', () => {
    const schema = descriptorToEffectSchema(
      primitives.foreignKey({ abbreviation: 'gen' }),
    );
    expect(Result.isFailure(Schema.decodeUnknownResult(schema)('foo'))).toBe(
      true,
    );
    expect(
      Result.isSuccess(Schema.decodeUnknownResult(schema)('gen_abcd')),
    ).toBe(true);
  });

  it('accepts null only when nullable', () => {
    const schema = descriptorToEffectSchema(
      primitives.foreignKey({ nullable: true, abbreviation: 'act' }),
    );
    expect(Result.isSuccess(Schema.decodeUnknownResult(schema)(null))).toBe(
      true,
    );
    expect(Result.isFailure(Schema.decodeUnknownResult(schema)('any'))).toBe(
      true,
    );
    expect(Result.isSuccess(Schema.decodeUnknownResult(schema)('act_ok'))).toBe(
      true,
    );
  });
});
