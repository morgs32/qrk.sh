import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { Effect, Result, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import {
  CuidFactory,
  descriptorToEffectSchema,
  encodeShape,
  generateProvisioningSqlForDescriptor,
  makeDrizzleSchemaFromEncodedTable,
  makeDrizzleSchemaFromTable,
  makeEffectSchema,
  makeTable,
  PrimitiveKind,
  primitives,
  type InferDecodedRow,
  type InferEncodedRow,
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

  it('targets an integer primary key without changing opaque-id refs', () => {
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

describe('primitives.opaqueId', () => {
  it('preserves abbreviation, nullability, and uniqueness', () => {
    expect(
      primitives.opaqueId({
        abbreviation: 'act',
        nullable: true,
        unique: true,
      }),
    ).toEqual({
      kind: PrimitiveKind.OpaqueId,
      abbreviation: 'act',
      nullable: true,
      unique: true,
    });
  });

  it('requires a non-empty abbreviation', () => {
    expect(() => primitives.opaqueId({ abbreviation: '' })).toThrow(
      'primitives.opaqueId requires a non-empty `abbreviation`',
    );
  });

  it('requires an abbreviation-prefixed value', () => {
    const schema = descriptorToEffectSchema(
      primitives.opaqueId({ abbreviation: 'gen' }),
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
      primitives.opaqueId({ nullable: true, abbreviation: 'act' }),
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

describe('descriptorToEffectSchema', () => {
  it('autogenerates omitted, null, and undefined primary keys while preserving supplied ids', async () => {
    const schema = makeEffectSchema({
      id: {
        ...primitives.primaryKey({ abbreviation: 'item' }),
        autogenerate: true,
        modelName: 'item',
      },
    });
    const decoded = await Effect.runPromise(
      Effect.all([
        Schema.decodeUnknownEffect(schema)({}),
        Schema.decodeUnknownEffect(schema)({ id: null }),
        Schema.decodeUnknownEffect(schema)({ id: undefined }),
        Schema.decodeUnknownEffect(schema)({ id: 'item_supplied' }),
      ]).pipe(
        Effect.provideService(
          CuidFactory,
          CuidFactory.of(() => Effect.succeed('generated')),
        ),
      ),
    );

    expect(decoded).toEqual([
      { id: 'item_generated' },
      { id: 'item_generated' },
      { id: 'item_generated' },
      { id: 'item_supplied' },
    ]);
  });

  it('supports boolean primitives', () => {
    const schema = descriptorToEffectSchema(primitives.boolean());
    expect(Result.isSuccess(Schema.decodeUnknownResult(schema)(true))).toBe(
      true,
    );
    expect(Result.isFailure(Schema.decodeUnknownResult(schema)(1))).toBe(true);
  });

  it('fills missing scalar default values during shape decode', () => {
    const defaultDate = new Date(0);
    const providedDate = new Date(1000);
    const schema = makeEffectSchema({
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

    expect(Schema.decodeUnknownSync(schema)({})).toEqual({
      flag: true,
      count: 5,
      ratio: 1.5,
      name: 'saved',
      createdAt: defaultDate,
      status: 'open',
    });
    expect(
      Schema.decodeUnknownSync(schema)({
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
    expect(() =>
      Schema.decodeUnknownSync(schema)({ count: undefined }),
    ).toThrow();
  });

  it('allows null for nullable scalar default values', () => {
    const defaultDate = new Date(0);
    const schema = makeEffectSchema({
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

    expect(Schema.decodeUnknownSync(schema)({})).toEqual({
      flag: true,
      count: 5,
      ratio: 1.5,
      name: 'saved',
      createdAt: defaultDate,
      status: 'open',
    });
    expect(
      Schema.decodeUnknownSync(schema)({
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

  it('fills missing nullable text null defaults during shape decode', () => {
    const schema = makeEffectSchema({
      name: primitives.text({ nullable: true, defaultValue: null }),
    });

    expect(Schema.decodeUnknownSync(schema)({})).toEqual({ name: null });
    expect(Schema.decodeUnknownSync(schema)({ name: null })).toEqual({
      name: null,
    });
    expect(Schema.decodeUnknownSync(schema)({ name: 'provided' })).toEqual({
      name: 'provided',
    });
    expect(() =>
      Schema.decodeUnknownSync(schema)({ name: undefined }),
    ).toThrow();
  });

  it('fills missing nullable json null defaults during shape decode', () => {
    const row = JSON.stringify({ x: 'ok' });
    const schema = makeEffectSchema({
      payload: nullableTinyJsonDefaultColumn,
    });

    expect(Schema.decodeUnknownSync(schema)({})).toEqual({ payload: null });
    expect(Schema.decodeUnknownSync(schema)({ payload: row })).toEqual({
      payload: { x: 'ok' },
    });
    expect(() =>
      Schema.decodeUnknownSync(schema)({ payload: undefined }),
    ).toThrow();
    expect(Schema.decodeUnknownSync(schema)({ payload: null })).toEqual({
      payload: null,
    });
  });

  it('supports json primitive as domain schema over string wire', () => {
    const schema = descriptorToEffectSchema(tinyJsonColumn);
    const row = JSON.stringify({ x: 'ok' });
    expect(Schema.decodeUnknownSync(schema)(row)).toEqual({ x: 'ok' });
    expect(Schema.encodeSync(schema)({ x: 'ok' })).toBe(row);
  });

  it('json descriptor exposes the domain schema', () => {
    const data = { x: 'ok' };
    expect(Schema.decodeUnknownSync(tinyJsonColumn.schema)(data)).toEqual(data);
  });

  it('nullable json encodes domain data or null to wire schema', () => {
    const schema = descriptorToEffectSchema(nullableTinyJsonColumn);
    expect(Schema.encodeSync(schema)(null)).toBe(null);
    expect(Schema.encodeSync(schema)({ x: 'ok' })).toBe(
      JSON.stringify({ x: 'ok' }),
    );
    expect(
      Schema.decodeUnknownSync(schema)(JSON.stringify({ x: 'ok' })),
    ).toEqual({ x: 'ok' });
  });

  it('json dates encode to ISO text and decode back to Date', () => {
    const schema = descriptorToEffectSchema(
      primitives.json({
        schema: Schema.Struct({
          happenedAt: Schema.DateFromString,
        }),
      }),
    );
    const happenedAt = new Date(0);

    expect(Schema.encodeSync(schema)({ happenedAt })).toBe(
      JSON.stringify({ happenedAt: happenedAt.toISOString() }),
    );
    expect(
      Schema.decodeUnknownSync(schema)(
        JSON.stringify({ happenedAt: happenedAt.toISOString() }),
      ).happenedAt,
    ).toEqual(happenedAt);
  });
});

describe('json shape row encode/decode', () => {
  it('round-trips json columns through makeEffectSchema', () => {
    const schema = makeEffectSchema({
      flag: primitives.boolean(),
      maybeJson: nullableTinyJsonColumn,
    });
    const domainRow = {
      flag: true,
      maybeJson: { x: 'ok' },
    };

    const wireRow = Schema.encodeSync(schema)(domainRow);

    expect(wireRow).toEqual({
      flag: true,
      maybeJson: JSON.stringify({ x: 'ok' }),
    });
    expect(Schema.decodeUnknownSync(schema)(wireRow)).toEqual(domainRow);
  });
});

describe('encoded primitive descriptors', () => {
  it('omits absent primary-key state and runtime ref tables', () => {
    const encoded = encodeShape({
      primaryKey: primitives.primaryKey({ abbreviation: 'pk' }),
      cursor: primitives.cursor({ abbreviation: 'cur' }),
      opaqueId: primitives.opaqueId({ abbreviation: 'ext' }),
      userId: primitives.ref({
        table: userTable,
        relation: 'user',
        inverse: 'records',
      }),
      text: primitives.text(),
    });

    expect('primaryKey' in encoded.primaryKey).toBe(false);
    expect('primaryKey' in encoded.cursor).toBe(false);
    expect('primaryKey' in encoded.opaqueId).toBe(false);
    expect('primaryKey' in encoded.userId).toBe(false);
    expect('primaryKey' in encoded.text).toBe(false);
    expect('defaultValue' in encoded.text).toBe(false);
    expect('table' in encoded.userId).toBe(false);
    expect(encoded.userId).toEqual({
      abbreviation: 'usr',
      inverse: 'records',
      kind: PrimitiveKind.Ref,
      nullable: false,
      relation: 'user',
      targetColumnName: 'id',
      targetTableName: 'user',
      unique: false,
    });
  });

  it('maps an encoded table shape and indexes directly to Drizzle', () => {
    const schema = makeDrizzleSchemaFromEncodedTable({
      name: 'encodedRecord',
      shape: encodeShape({
        id: primitives.primaryKey({ abbreviation: 'record' }),
        name: primitives.text(),
        userId: primitives.ref({
          table: userTable,
          relation: 'user',
          inverse: 'records',
        }),
      }),
      indexes: [
        {
          name: 'encodedRecord_name_userId_idx',
          columns: ['name', 'userId'],
          unique: true,
        },
      ],
    });
    const tableConfig = getTableConfig(schema);

    expect(tableConfig.name).toBe('encodedRecord');
    expect(tableConfig.columns).toMatchObject([
      { name: 'id', notNull: true, primary: true },
      { name: 'name', notNull: true, primary: false },
      { name: 'userId', notNull: true, primary: false },
    ]);
    expect(
      tableConfig.indexes.map(index => ({
        name: index.config.name,
        columns: index.config.columns.map(column =>
          'name' in column ? column.name : null,
        ),
        unique: index.config.unique,
      })),
    ).toEqual([
      {
        name: 'encodedRecord_name_userId_idx',
        columns: ['name', 'userId'],
        unique: true,
      },
    ]);
  });
});

describe('primitive Drizzle columns', () => {
  it('marks only dedicated primary-key descriptors as primary columns', () => {
    const table = makeTable({
      name: 'primitiveTaxonomy',
      shape: {
        primaryKey: primitives.primaryKey({ abbreviation: 'row' }),
        cursor: primitives.cursor({ abbreviation: 'cur' }),
        opaqueId: primitives.opaqueId({ abbreviation: 'ext' }),
        userId: primitives.ref({
          table: userTable,
          relation: 'user',
          inverse: 'records',
        }),
        text: primitives.text(),
      },
    });
    const columns = getTableConfig(makeDrizzleSchemaFromTable(table)).columns;

    expect(columns[0]).toMatchObject({
      name: 'primaryKey',
      notNull: true,
      primary: true,
    });
    expect(columns[1]).toMatchObject({
      name: 'cursor',
      notNull: true,
      primary: false,
    });
    expect(columns[2]).toMatchObject({
      name: 'opaqueId',
      notNull: true,
      primary: false,
    });
    expect(columns[3]).toMatchObject({
      name: 'userId',
      notNull: true,
      primary: false,
    });
    expect(columns[4]).toMatchObject({
      name: 'text',
      notNull: true,
      primary: false,
    });
  });

  it('builds numeric ref columns with a literal integer foreign key', () => {
    const numericBlockDrizzleSchema =
      makeDrizzleSchemaFromTable(numericBlockTable);
    const commandTable = makeTable({
      name: 'numericBlockCommand',
      shape: {
        commandId: primitives.primaryKey({ abbreviation: 'cmd' }),
        blockIndex: primitives.ref({
          table: numericBlockTable,
          relation: 'block',
          inverse: 'commands',
        }),
      },
    });
    const commandDrizzleSchema = makeDrizzleSchemaFromTable(
      commandTable,
      () => () => numericBlockDrizzleSchema.blockIndex,
    );
    const tableConfig = getTableConfig(commandDrizzleSchema);
    const reference = tableConfig.foreignKeys[0]?.reference();

    expect(tableConfig.columns[1]).toMatchObject({
      dataType: 'number int53',
      name: 'blockIndex',
      notNull: true,
      primary: false,
    });
    expect(reference?.columns.map(column => column.name)).toEqual([
      'blockIndex',
    ]);
    expect(reference?.foreignColumns.map(column => column.name)).toEqual([
      'blockIndex',
    ]);
    expect(getTableConfig(reference!.foreignTable).name).toBe('numericBlock');
  });

  it('maps encoded numeric refs back to integer columns', () => {
    const encodedSchema = makeDrizzleSchemaFromEncodedTable({
      name: 'encodedNumericBlockCommand',
      shape: encodeShape({
        commandId: primitives.primaryKey({ abbreviation: 'cmd' }),
        blockIndex: primitives.ref({
          table: numericBlockTable,
          relation: 'block',
          inverse: 'commands',
        }),
      }),
      indexes: [],
    });

    expect(getTableConfig(encodedSchema).columns[1]).toMatchObject({
      dataType: 'number int53',
      name: 'blockIndex',
      notNull: true,
    });
  });
});

describe('generateProvisioningSqlForDescriptor', () => {
  it('returns expected SQL for non-nullable built-ins', () => {
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.primaryKey({ abbreviation: 'usr' }),
        'id',
      ),
    ).toBe('id text PRIMARY KEY NOT NULL');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.cursor({ abbreviation: 'cur' }),
        'cursor',
      ),
    ).toBe('cursor text NOT NULL');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.opaqueId({ abbreviation: 'ext' }),
        'externalId',
      ),
    ).toBe('externalId text NOT NULL');
    expect(
      generateProvisioningSqlForDescriptor(primitives.text(), 'version'),
    ).toBe('version text NOT NULL');
    expect(
      generateProvisioningSqlForDescriptor(primitives.integer(), 'count'),
    ).toBe('count integer NOT NULL');
    expect(
      generateProvisioningSqlForDescriptor(primitives.boolean(), 'flag'),
    ).toBe('flag integer NOT NULL');
    expect(generateProvisioningSqlForDescriptor(primitives.text(), 'name')).toBe(
      'name text NOT NULL',
    );
    expect(generateProvisioningSqlForDescriptor(tinyJsonColumn, 'payload')).toBe(
      'payload text NOT NULL',
    );
    expect(
      generateProvisioningSqlForDescriptor(primitives.date(), 'createdAt'),
    ).toBe('createdAt integer NOT NULL');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.enum({ values: ['open', 'closed'] }),
        'status',
      ),
    ).toBe('status text NOT NULL');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.ref({
          table: userTable,
          relation: 'user',
          inverse: 'records',
        }),
        'userId',
      ),
    ).toBe('userId text NOT NULL');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.ref({
          table: numericBlockTable,
          relation: 'block',
          inverse: 'commands',
        }),
        'blockIndex',
      ),
    ).toBe('blockIndex integer NOT NULL');
  });

  it('returns expected SQL for nullable built-ins', () => {
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.integer({ nullable: true }),
        'count',
      ),
    ).toBe('count integer');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.boolean({ nullable: true }),
        'flag',
      ),
    ).toBe('flag integer');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.text({ nullable: true }),
        'name',
      ),
    ).toBe('name text');
    expect(
      generateProvisioningSqlForDescriptor(nullableTinyJsonColumn, 'payload'),
    ).toBe('payload text');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.date({ nullable: true }),
        'createdAt',
      ),
    ).toBe('createdAt integer');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.enum({ values: ['open', 'closed'], nullable: true }),
        'status',
      ),
    ).toBe('status text');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.cursor({ abbreviation: 'cur', nullable: true }),
        'cursor',
      ),
    ).toBe('cursor text');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.opaqueId({ abbreviation: 'ext', nullable: true }),
        'externalId',
      ),
    ).toBe('externalId text');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.ref({
          table: userTable,
          relation: 'user',
          inverse: 'records',
          nullable: true,
        }),
        'userId',
      ),
    ).toBe('userId text');
  });

  it('does not emit a SQLite reference constraint for table refs', () => {
    const sql = generateProvisioningSqlForDescriptor(
      primitives.ref({
        table: userTable,
        relation: 'user',
        inverse: 'records',
      }),
      'userId',
    );

    expect(sql).toBe('userId text NOT NULL');
    expect(sql).not.toContain('REFERENCES');
  });

  it('appends UNIQUE to provisioning SQL when unique is true', () => {
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.text({ unique: true }),
        'email',
      ),
    ).toBe('email text NOT NULL UNIQUE');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.text({ nullable: true, unique: true }),
        'email',
      ),
    ).toBe('email text UNIQUE');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.integer({ unique: true }),
        'slot',
      ),
    ).toBe('slot integer NOT NULL UNIQUE');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.ref({
          table: userTable,
          relation: 'user',
          inverse: 'profile',
          unique: true,
        }),
        'userId',
      ),
    ).toBe('userId text NOT NULL UNIQUE');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.opaqueId({ abbreviation: 'ext', unique: true }),
        'externalId',
      ),
    ).toBe('externalId text NOT NULL UNIQUE');
  });

  it('appends DEFAULT to provisioning SQL for defaulted scalar primitives', () => {
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.boolean({ defaultValue: true }),
        'flag',
      ),
    ).toBe('flag integer NOT NULL DEFAULT 1');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.boolean({ nullable: true, defaultValue: false }),
        'flag',
      ),
    ).toBe('flag integer DEFAULT 0');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.integer({ defaultValue: 5 }),
        'count',
      ),
    ).toBe('count integer NOT NULL DEFAULT 5');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.integer({ nullable: true, defaultValue: 5 }),
        'count',
      ),
    ).toBe('count integer DEFAULT 5');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.number({ defaultValue: 1.5 }),
        'ratio',
      ),
    ).toBe('ratio real NOT NULL DEFAULT 1.5');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.text({ defaultValue: "it's saved" }),
        'name',
      ),
    ).toBe("name text NOT NULL DEFAULT 'it''s saved'");
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.text({ nullable: true, defaultValue: null }),
        'name',
      ),
    ).toBe('name text DEFAULT NULL');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.date({
          defaultValue: new Date('2026-08-24T12:34:56.123Z'),
        }),
        'createdAt',
      ),
    ).toBe('createdAt integer NOT NULL DEFAULT 1787574896123');
    expect(
      generateProvisioningSqlForDescriptor(
        primitives.enum({
          values: ['open', 'closed'],
          defaultValue: 'open',
        }),
        'status',
      ),
    ).toBe("status text NOT NULL DEFAULT 'open'");
    expect(
      generateProvisioningSqlForDescriptor(
        nullableTinyJsonDefaultColumn,
        'payload',
      ),
    ).toBe('payload text DEFAULT NULL');
  });
});

describe('primitive type inference', () => {
  it('infers encoded and decoded primitive types', () => {
    const builtinsShape = Object.freeze({
      pk: primitives.primaryKey({ abbreviation: 'pkg' }),
      int: primitives.integer(),
      defaultInt: primitives.integer({ defaultValue: 5 }),
      maybeInt: primitives.integer({ nullable: true }),
      defaultBool: primitives.boolean({ defaultValue: true }),
      num: primitives.number(),
      defaultNum: primitives.number({ defaultValue: 1.5 }),
      maybeNum: primitives.number({ nullable: true }),
      text: primitives.text(),
      defaultText: primitives.text({ defaultValue: 'saved' }),
      maybeText: primitives.text({ nullable: true }),
      status: primitives.enum({ values: ['open', 'closed'] }),
      defaultStatus: primitives.enum({
        values: ['open', 'closed'],
        defaultValue: 'open',
      }),
      maybeStatus: primitives.enum({
        values: ['open', 'closed'],
        nullable: true,
      }),
      createdAt: primitives.date(),
      defaultCreatedAt: primitives.date({ defaultValue: new Date(0) }),
      deletedAt: primitives.date({ nullable: true }),
    });

    const refShape = Object.freeze({
      userId: primitives.ref({
        table: userTable,
        relation: 'user',
        inverse: 'records',
      }),
    });

    const nullableRefShape = Object.freeze({
      userId: primitives.ref({
        table: userTable,
        relation: 'user',
        inverse: 'records',
        nullable: true,
      }),
    });

    const numericRefShape = Object.freeze({
      blockIndex: primitives.ref({
        table: numericBlockTable,
        relation: 'block',
        inverse: 'commands',
      }),
    });

    const nullableNumericRefShape = Object.freeze({
      blockIndex: primitives.ref({
        table: numericBlockTable,
        relation: 'nullableBlock',
        inverse: 'nullableCommands',
        nullable: true,
      }),
    });

    const opaqueIdShape = Object.freeze({
      userId: primitives.opaqueId({ abbreviation: 'usr' }),
    });

    const nullableOpaqueIdShape = Object.freeze({
      userId: primitives.opaqueId({ nullable: true, abbreviation: 'act' }),
    });

    const primaryKeyShape = Object.freeze({
      id: primitives.primaryKey({ abbreviation: 'usr' }),
    });

    const cursorShape = {
      cursor: primitives.cursor({ abbreviation: 'cur' }),
      maybeCursor: primitives.cursor({
        abbreviation: 'cur',
        nullable: true,
      }),
    };

    const cloudRepoShape = Object.freeze({
      flag: primitives.boolean(),
      maybeJson: nullableTinyJsonColumn,
      defaultJson: nullableTinyJsonDefaultColumn,
      createdAt: primitives.date(),
    });

    assert<
      Equals<
        InferEncodedRow<typeof builtinsShape>,
        {
          readonly pk: `pkg_${string}`;
          readonly int: number;
          readonly defaultInt: number;
          readonly maybeInt: number | null;
          readonly defaultBool: boolean;
          readonly num: number;
          readonly defaultNum: number;
          readonly maybeNum: number | null;
          readonly text: string;
          readonly defaultText: string;
          readonly maybeText: string | null;
          readonly status: 'open' | 'closed';
          readonly defaultStatus: 'open' | 'closed';
          readonly maybeStatus: 'open' | 'closed' | null;
          readonly createdAt: Date;
          readonly defaultCreatedAt: Date;
          readonly deletedAt: Date | null;
        }
      >
    >();
    assert<
      Equals<
        InferDecodedRow<typeof builtinsShape>,
        {
          readonly pk: `pkg_${string}`;
          readonly int: number;
          readonly defaultInt: number;
          readonly maybeInt: number | null;
          readonly defaultBool: boolean;
          readonly num: number;
          readonly defaultNum: number;
          readonly maybeNum: number | null;
          readonly text: string;
          readonly defaultText: string;
          readonly maybeText: string | null;
          readonly status: 'open' | 'closed';
          readonly defaultStatus: 'open' | 'closed';
          readonly maybeStatus: 'open' | 'closed' | null;
          readonly createdAt: Date;
          readonly defaultCreatedAt: Date;
          readonly deletedAt: Date | null;
        }
      >
    >();

    assert<
      Equals<
        InferEncodedRow<typeof refShape>,
        { readonly userId: `usr_${string}` }
      >
    >();
    assert<
      Equals<
        InferDecodedRow<typeof refShape>,
        { readonly userId: `usr_${string}` }
      >
    >();

    assert<
      Equals<
        InferEncodedRow<typeof nullableRefShape>,
        { readonly userId: `usr_${string}` | null }
      >
    >();
    assert<
      Equals<
        InferDecodedRow<typeof nullableRefShape>,
        { readonly userId: `usr_${string}` | null }
      >
    >();

    assert<
      Equals<
        InferEncodedRow<typeof numericRefShape>,
        { readonly blockIndex: number }
      >
    >();
    assert<
      Equals<
        InferDecodedRow<typeof numericRefShape>,
        { readonly blockIndex: number }
      >
    >();
    assert<
      Equals<
        InferEncodedRow<typeof nullableNumericRefShape>,
        { readonly blockIndex: number | null }
      >
    >();
    assert<
      Equals<
        InferDecodedRow<typeof nullableNumericRefShape>,
        { readonly blockIndex: number | null }
      >
    >();

    assert<
      Equals<
        InferEncodedRow<typeof opaqueIdShape>,
        { readonly userId: `usr_${string}` }
      >
    >();
    assert<
      Equals<
        InferDecodedRow<typeof opaqueIdShape>,
        { readonly userId: `usr_${string}` }
      >
    >();

    assert<
      Equals<
        InferEncodedRow<typeof nullableOpaqueIdShape>,
        { readonly userId: `act_${string}` | null }
      >
    >();
    assert<
      Equals<
        InferDecodedRow<typeof nullableOpaqueIdShape>,
        { readonly userId: `act_${string}` | null }
      >
    >();

    assert<
      Equals<
        InferEncodedRow<typeof primaryKeyShape>,
        { readonly id: `usr_${string}` }
      >
    >();
    assert<
      Equals<
        InferDecodedRow<typeof primaryKeyShape>,
        { readonly id: `usr_${string}` }
      >
    >();

    assert<
      Equals<
        InferEncodedRow<typeof cursorShape>,
        {
          cursor: `cur_${string}`;
          maybeCursor: `cur_${string}` | null;
        }
      >
    >();
    assert<
      Equals<
        InferDecodedRow<typeof cursorShape>,
        {
          cursor: `cur_${string}`;
          maybeCursor: `cur_${string}` | null;
        }
      >
    >();

    assert<
      Equals<
        InferEncodedRow<typeof cloudRepoShape>,
        {
          readonly flag: boolean;
          readonly maybeJson: string | null;
          readonly defaultJson: string | null;
          readonly createdAt: Date;
        }
      >
    >();
    assert<
      Equals<
        InferDecodedRow<typeof cloudRepoShape>,
        {
          readonly flag: boolean;
          readonly maybeJson: { x: string } | null;
          readonly defaultJson: { x: string } | null;
          readonly createdAt: Date;
        }
      >
    >();
  });
});
