import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import { makeModel } from './makeModel.ts';
import { PrimitiveKind } from './primitiveKind.ts';
import { makeEffectSchema } from './primitiveMaps.ts';
import { primitives } from './primitives.ts';
import type { IModel, InferResource } from './types.ts';

const namePropertySchema = primitives.text();

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

const Todo = makeModel(
  {
    abbreviation: 'todo',
    modelName: 'todo',
    attributes: {
      title: primitives.text(),
      completed: primitives.boolean(),
    },
    indexes: [],
    version: '2.0.0',
  },
  [
    {
      abbreviation: 'todo',
      modelName: 'todo',
      attributes: {
        title: primitives.text(),
      },
      indexes: [],
      version: '1.0.0',
      adaptResource: ({ resource }) =>
        Effect.succeed({
          id: resource.id,
          modelName: resource.modelName,
          createdAt: resource.createdAt,
          updatedAt: resource.updatedAt,
          version: '1.0.0',
          title: resource.title,
        }),
    },
    {
      abbreviation: 'todo',
      modelName: 'todo',
      attributes: {
        description: primitives.text({ nullable: true }),
      },
      indexes: [],
      version: '0.5.0',
      adaptResource: ({ resource }) =>
        Effect.succeed({
          id: resource.id,
          modelName: resource.modelName,
          createdAt: resource.createdAt,
          updatedAt: resource.updatedAt,
          version: '0.5.0',
          description: resource.title,
        }),
    },
  ],
);

describe('makeModel', () => {
  it('types id as InferIdFromAbbreviation from model abbreviation (shape, resource, Drizzle select)', () => {
    type UserRow = InferResource<typeof User>;
    assert<Equals<UserRow['id'], `usr_${string}`>>();
    assert<Equals<InferResource<typeof User>['id'], `usr_${string}`>>();
    assert<
      Equals<
        'deletedAt' extends keyof InferResource<typeof User> ? true : false,
        false
      >
    >();

    // Drizzle `$inferSelect.id` stays `string`; typed row shape uses `InferResource` for prefix branding.
  });

  it('returns a model with abbreviation, modelName, attributes, version', () => {
    expect(User.abbreviation).toBe('usr');
    expect(User.modelName).toBe('user');
    expect(User.attributes).toEqual({
      name: namePropertySchema,
    });
    expect(Object.keys(User.metadata)).toEqual([
      'id',
      'modelName',
      'createdAt',
      'updatedAt',
      'version',
    ]);
    expect(User.metadata).not.toHaveProperty('deletedAt');
    expect(User.propertiesShape).toEqual({
      ...User.metadata,
      ...User.attributes,
    });
    expect(User.version).toBe('1.0.0');
    expect(makeEffectSchema(User.attributes)).toBeDefined();
    expect(User.drizzleSchema).toBeDefined();
    expect(User.spec.modelName).toBe('user');
    expect(User.spec.abbreviation).toBe('usr');
    expect(User.spec.version).toBe('1.0.0');
    expect(User.spec.attributes).toEqual(['name']);
    expect(User.spec.propertiesJsonSchema).toMatchObject({ type: 'object' });
    expect(() => structuredClone(User.spec)).not.toThrow();
  });

  it('structuredClone of model sans runtime schemas works', () => {
    const {
      adaptResource: _adaptResource,
      attributesSchema: _attributes,
      drizzleSchema: _drizzle,
      makeId: _makeId,
      create: _create,
      createMutation: _createMutation,
      delete: _delete,
      deleteMutation: _deleteMutation,
      move: _move,
      moveMutation: _moveMutation,
      primaryKey: _primaryKey,
      prefixId: _prefixId,
      replicateResource: _replicateResource,
      replicateResourceMutation: _replicateResourceMutation,
      resourceSchema: _resourceSchema,
      update: _update,
      updateMutation: _updateMutation,
      ...cloneable
    } = User;
    expect(() => structuredClone(cloneable)).not.toThrow();
  });

  it('prefixes deterministic ids with the model abbreviation', () => {
    expect(User.prefixId('abc')).toBe('usr_abc');
  });

  it('structuredClone of plain shape works', () => {
    const plain = {
      abbreviation: User.abbreviation,
      attributeKeys: Object.keys(User.attributes),
      modelName: User.modelName,
      version: User.version,
    };
    const cloned = structuredClone(plain);
    expect(cloned).toEqual(plain);
    expect(cloned).not.toBe(plain);
  });

  it('retains complete historical definitions independently of their input order', () => {
    expect(Todo.historicalDefinitions).toEqual([
      {
        abbreviation: 'todo',
        modelName: 'todo',
        attributes: {
          title: expect.objectContaining({ kind: PrimitiveKind.Text }),
        },
        indexes: [],
        version: '1.0.0',
        adaptResource: expect.any(Function),
      },
      {
        abbreviation: 'todo',
        modelName: 'todo',
        attributes: {
          description: expect.objectContaining({ kind: PrimitiveKind.Text }),
        },
        indexes: [],
        version: '0.5.0',
        adaptResource: expect.any(Function),
      },
    ]);
  });

  it('validates the complete current resource and directly encodes current or historical resources', () => {
    const createdAt = new Date('2026-08-05T12:00:00.000Z');
    const updatedAt = new Date('2026-08-05T13:00:00.000Z');
    const currentResource = {
      id: 'todo_current',
      modelName: 'todo',
      createdAt,
      updatedAt,
      version: '2.0.0',
      title: 'Current todo',
      completed: true,
    };

    expect(
      Effect.runSync(
        Todo.adaptResource({
          version: '2.0.0',
          resource: currentResource,
        }),
      ),
    ).toEqual({
      ...currentResource,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
    const historicalResource = Effect.runSync(
      Todo.adaptResource({
        version: '1.0.0',
        resource: currentResource,
      }),
    );
    expect(historicalResource).toEqual({
      id: 'todo_current',
      modelName: 'todo',
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      version: '1.0.0',
      title: 'Current todo',
    });
    expect(historicalResource.id).toBe(currentResource.id);

    expect(() =>
      Effect.runSync(
        Todo.adaptResource({
          version: '1.0.0',
          resource: { ...currentResource, version: '1.0.0' },
        }),
      ),
    ).toThrow(/model-current-resource-identity-invalid/);
  });

  it('selects one exact historical adapter without chaining', () => {
    let versionOneCalls = 0;
    let versionZeroCalls = 0;
    const Direct = makeModel(
      {
        abbreviation: 'dir',
        modelName: 'direct',
        attributes: { current: primitives.text() },
        indexes: [],
        version: '2.0.0',
      },
      [
        {
          abbreviation: 'dir',
          modelName: 'direct',
          attributes: { prior: primitives.text() },
          indexes: [],
          version: '1.0.0',
          adaptResource: ({ resource }) =>
            Effect.sync(() => {
              versionOneCalls += 1;
              return {
                id: resource.id,
                modelName: resource.modelName,
                createdAt: resource.createdAt,
                updatedAt: resource.updatedAt,
                version: '1.0.0',
                prior: resource.current,
              };
            }),
        },
        {
          abbreviation: 'dir',
          modelName: 'direct',
          attributes: { original: primitives.text() },
          indexes: [],
          version: '0.5.0',
          adaptResource: ({ resource }) =>
            Effect.sync(() => {
              versionZeroCalls += 1;
              return {
                id: resource.id,
                modelName: resource.modelName,
                createdAt: resource.createdAt,
                updatedAt: resource.updatedAt,
                version: '0.5.0',
                original: resource.current,
              };
            }),
        },
      ],
    );

    Effect.runSync(
      Direct.adaptResource({
        version: '0.5.0',
        resource: {
          id: 'dir_test',
          modelName: 'direct',
          createdAt: new Date(0),
          updatedAt: new Date(0),
          version: '2.0.0',
          current: 'current',
        },
      }),
    );

    expect(versionOneCalls).toBe(0);
    expect(versionZeroCalls).toBe(1);
  });

  it('surfaces adapter throws and invalid exact output as invariant failures', () => {
    const Throwing = makeModel(
      {
        abbreviation: 'thr',
        modelName: 'throwing',
        attributes: { value: primitives.integer() },
        indexes: [],
        version: '2.0.0',
      },
      [
        {
          abbreviation: 'thr',
          modelName: 'throwing',
          attributes: { value: primitives.integer() },
          indexes: [],
          version: '1.0.0',
          adaptResource: () => {
            throw new Error('adapter exploded');
          },
        },
      ],
    );
    const Invalid = makeModel(
      {
        abbreviation: 'inv',
        modelName: 'invalidOutput',
        attributes: { value: primitives.integer() },
        indexes: [],
        version: '2.0.0',
      },
      [
        {
          abbreviation: 'inv',
          modelName: 'invalidOutput',
          attributes: { value: primitives.text() },
          indexes: [],
          version: '1.0.0',
          adaptResource: ({ resource }) =>
            Effect.succeed({
              id: resource.id,
              modelName: resource.modelName,
              createdAt: resource.createdAt,
              updatedAt: resource.updatedAt,
              version: '1.0.0',
              value: Reflect.get(resource, 'value'),
            }),
        },
      ],
    );

    expect(() =>
      Effect.runSync(
        Throwing.adaptResource({
          version: '1.0.0',
          resource: {
            id: 'thr_test',
            modelName: 'throwing',
            createdAt: new Date(0),
            updatedAt: new Date(0),
            version: '2.0.0',
            value: 1,
          },
        }),
      ),
    ).toThrow(/model-resource-adapter-invariant-failed/);
    expect(() =>
      Effect.runSync(
        Invalid.adaptResource({
          version: '1.0.0',
          resource: {
            id: 'inv_test',
            modelName: 'invalidOutput',
            createdAt: new Date(0),
            updatedAt: new Date(0),
            version: '2.0.0',
            value: 1,
          },
        }),
      ),
    ).toThrow(/model-resource-adapter-output-invariant-failed/);
  });

  it('encodes and decodes versioned create, update, delete, and move mutations', () => {
    const created = Effect.runSync(
      Todo.create('1.0.0', {
        resourceId: 'todo_old',
        attributes: { title: 'Old todo' },
      }),
    );
    const encodedCreate = Schema.encodeSync(Todo.createMutation('1.0.0'))(
      created,
    );
    expect(encodedCreate).toEqual({
      modelName: 'todo',
      modelVersion: '1.0.0',
      operationName: 'create',
      resourceId: 'todo_old',
      operation: { attributes: { title: 'Old todo' } },
    });
    expect(
      Schema.decodeSync(Todo.createMutation('1.0.0'))(encodedCreate).model,
    ).toBe(Todo);

    const updated = Effect.runSync(
      Todo.update('2.0.0', {
        resourceId: 'todo_current',
        attributes: { completed: true },
        mask: ['completed'],
      }),
    );
    expect(Schema.encodeSync(Todo.updateMutation('2.0.0'))(updated)).toEqual({
      modelName: 'todo',
      modelVersion: '2.0.0',
      operationName: 'update',
      resourceId: 'todo_current',
      operation: { attributes: { completed: true }, mask: ['completed'] },
    });

    const deleted = Effect.runSync(
      Todo.delete('1.0.0', { resourceId: 'todo_old' }),
    );
    expect(Schema.encodeSync(Todo.deleteMutation('1.0.0'))(deleted)).toEqual({
      modelName: 'todo',
      modelVersion: '1.0.0',
      operationName: 'delete',
      resourceId: 'todo_old',
      operation: {},
    });

    const moved = Effect.runSync(
      Todo.move('2.0.0', {
        resourceId: 'todo_current',
        property: 'parentId',
        prevId: 'todo_prev',
        nextId: 'todo_next',
      }),
    );
    expect(Schema.encodeSync(Todo.moveMutation('2.0.0'))(moved)).toEqual({
      modelName: 'todo',
      modelVersion: '2.0.0',
      operationName: 'move',
      resourceId: 'todo_current',
      operation: {
        property: 'parentId',
        prevId: 'todo_prev',
        nextId: 'todo_next',
      },
    });
  });

  it('rejects unknown operation versions before schema or Effect construction', () => {
    const erasedTodo: IModel = Todo;

    expect(() => erasedTodo.createMutation('9.0.0')).toThrow(
      /Unknown model version "9.0.0" for "todo"/,
    );
    expect(() =>
      erasedTodo.create('9.0.0', {
        resourceId: 'todo_unknown',
        attributes: { title: 'Unknown' },
      }),
    ).toThrow(/Unknown model version "9.0.0" for "todo"/);
    expect(() => erasedTodo.updateMutation('9.0.0')).toThrow(
      /Unknown model version "9.0.0" for "todo"/,
    );
    expect(() =>
      erasedTodo.update('9.0.0', {
        resourceId: 'todo_unknown',
        attributes: {},
      }),
    ).toThrow(/Unknown model version "9.0.0" for "todo"/);
    expect(() => erasedTodo.deleteMutation('9.0.0')).toThrow(
      /Unknown model version "9.0.0" for "todo"/,
    );
    expect(() =>
      erasedTodo.delete('9.0.0', { resourceId: 'todo_unknown' }),
    ).toThrow(/Unknown model version "9.0.0" for "todo"/);
    expect(() => erasedTodo.moveMutation('9.0.0')).toThrow(
      /Unknown model version "9.0.0" for "todo"/,
    );
    expect(() =>
      erasedTodo.move('9.0.0', {
        resourceId: 'todo_unknown',
        property: 'parentId',
        prevId: 'todo_prev',
        nextId: 'todo_next',
      }),
    ).toThrow(/Unknown model version "9.0.0" for "todo"/);
  });

  it('rejects invalid and duplicate current or historical SemVers', () => {
    expect(() =>
      makeModel(
        {
          abbreviation: 'bad',
          modelName: 'badSemver',
          attributes: {},
          indexes: [],
          version: '1',
        },
        [],
      ),
    ).toThrow(/expected SemVer/);

    expect(() =>
      makeModel(
        {
          abbreviation: 'bad',
          modelName: 'badHistoricalSemver',
          attributes: {},
          indexes: [],
          version: '2.0.0',
        },
        [
          {
            abbreviation: 'bad',
            modelName: 'badHistoricalSemver',
            attributes: {},
            indexes: [],
            version: '1',
            adaptResource: ({ resource }) =>
              Effect.succeed({ ...resource, version: '1' }),
          },
        ],
      ),
    ).toThrow(/Invalid historical model version "1"/);

    expect(() =>
      makeModel(
        {
          abbreviation: 'dup',
          modelName: 'duplicateVersion',
          attributes: {},
          indexes: [],
          version: '2.0.0',
        },
        [
          {
            abbreviation: 'dup',
            modelName: 'duplicateVersion',
            attributes: {},
            indexes: [],
            version: '2.0.0',
            adaptResource: ({ resource }) => Effect.succeed(resource),
          },
        ],
      ),
    ).toThrow(/Duplicate model version "2.0.0"/);

    expect(() =>
      makeModel(
        {
          abbreviation: 'dup',
          modelName: 'duplicateHistory',
          attributes: {},
          indexes: [],
          version: '3.0.0',
        },
        [
          {
            abbreviation: 'dup',
            modelName: 'duplicateHistory',
            attributes: {},
            indexes: [],
            version: '1.0.0',
            adaptResource: ({ resource }) =>
              Effect.succeed({ ...resource, version: '1.0.0' }),
          },
          {
            abbreviation: 'dup',
            modelName: 'duplicateHistory',
            attributes: {},
            indexes: [],
            version: '1.0.0',
            adaptResource: ({ resource }) =>
              Effect.succeed({ ...resource, version: '1.0.0' }),
          },
        ],
      ),
    ).toThrow(/Duplicate model version "1.0.0"/);

    expect(() =>
      makeModel(
        {
          abbreviation: 'new',
          modelName: 'newerHistory',
          attributes: {},
          indexes: [],
          version: '2.0.0',
        },
        [
          {
            abbreviation: 'new',
            modelName: 'newerHistory',
            attributes: {},
            indexes: [],
            version: '3.0.0',
            adaptResource: ({ resource }) =>
              Effect.succeed({ ...resource, version: '3.0.0' }),
          },
        ],
      ),
    ).toThrow(/must be older than current version "2.0.0"/);

    const missingAdapter = {
      abbreviation: 'mis',
      modelName: 'missingAdapter',
      attributes: {},
      indexes: [],
      version: '1.0.0',
      adaptResource: () =>
        Effect.succeed({
          id: 'mis_test',
          modelName: 'missingAdapter',
          createdAt: new Date(0),
          updatedAt: new Date(0),
          version: '1.0.0',
        }),
    };
    Reflect.deleteProperty(missingAdapter, 'adaptResource');
    expect(() =>
      makeModel(
        {
          abbreviation: 'mis',
          modelName: 'missingAdapter',
          attributes: {},
          indexes: [],
          version: '2.0.0',
        },
        [missingAdapter],
      ),
    ).toThrow(/requires adaptResource/);
  });

  it('rejects historical identity mismatches', () => {
    expect(() =>
      makeModel(
        {
          abbreviation: 'todo',
          modelName: 'todo',
          attributes: {},
          indexes: [],
          version: '2.0.0',
        },
        [
          {
            abbreviation: 'todo',
            // @ts-expect-error runtime validation protects untyped historical definitions
            modelName: 'task',
            attributes: {},
            indexes: [],
            version: '1.0.0',
            adaptResource: ({ resource }) =>
              Effect.succeed({ ...resource, version: '1.0.0' }),
          },
        ],
      ),
    ).toThrow(/has modelName "task", not "todo"/);

    expect(() =>
      makeModel(
        {
          abbreviation: 'todo',
          modelName: 'todo',
          attributes: {},
          indexes: [],
          version: '2.0.0',
        },
        [
          {
            // @ts-expect-error runtime validation protects untyped historical definitions
            abbreviation: 'tsk',
            modelName: 'todo',
            attributes: {},
            indexes: [],
            version: '1.0.0',
            adaptResource: ({ resource }) =>
              Effect.succeed({ ...resource, version: '1.0.0' }),
          },
        ],
      ),
    ).toThrow(/has abbreviation "tsk", not "todo"/);
  });

  it('invalid attributes (e.g. Schema instead of descriptor) throw at runtime', () => {
    expect(() =>
      makeModel(
        {
          abbreviation: 'bad',
          modelName: 'bad',
          attributes: {
            // @ts-expect-error - reserved keys cannot be used as property keys
            id: Schema.String,
          },
          indexes: [],
          version: '1.0.0',
        },
        [],
      ),
    ).toThrow();
  });

  it('reserves service deletion metadata on plain models', () => {
    expect(() =>
      makeModel(
        {
          abbreviation: 'bad',
          modelName: 'reservedDeletedAt',
          attributes: {
            // @ts-expect-error deletedAt is framework metadata even on plain models
            deletedAt: primitives.date({ nullable: true }),
          },
          indexes: [],
          version: '1.0.0',
        },
        [],
      ),
    ).toThrow(/framework metadata keys are reserved/);
  });

  it('rejects payload primary keys on attributes', () => {
    expect(() =>
      makeModel(
        {
          abbreviation: 'xid',
          modelName: 'withAutogeneratedAttribute',
          attributes: {
            // @ts-expect-error makeModel attributes cannot autogenerate payload identities
            otherId: Object.assign(
              primitives.opaqueId({ abbreviation: 'usr' }),
              { autogenerate: true },
            ),
          },
          indexes: [],
          version: '1.0.0',
        },
        [],
      ),
    ).toThrow(/autogeneration belongs to contract payload primary keys/);
  });

  it('allows opaque IDs on attributes', () => {
    const model = makeModel(
      {
        abbreviation: 'xid',
        modelName: 'withAbbrevId',
        attributes: {
          userId: primitives.opaqueId({ abbreviation: 'uid' }),
        },
        indexes: [],
        version: '1.0.0',
      },
      [],
    );
    expect(model.attributes.userId.kind).toBe(PrimitiveKind.OpaqueId);
  });

  it('rejects primary-key attributes because the model owns its synthesized id', () => {
    expect(() =>
      makeModel(
        {
          abbreviation: 'xpk',
          modelName: 'withExtraPrimaryKey',
          attributes: {
            // @ts-expect-error makeModel attributes cannot declare a primary key
            versionName: primitives.primaryKey({ abbreviation: 'vrsn' }),
          },
          indexes: [],
          version: '1.0.0',
        },
        [],
      ),
    ).toThrow(/makeModel synthesizes the model id primary key/);
  });

  it('accepts indexes on merged properties including metadata keys', () => {
    const IndexedUser = makeModel(
      {
        abbreviation: 'usr',
        modelName: 'indexedUser',
        attributes: {
          name: primitives.text(),
        },
        indexes: [
          {
            name: 'indexedUser_createdAt_name_idx',
            columns: ['createdAt', 'name'],
          },
          {
            name: 'indexedUser_modelName_idx',
            columns: ['modelName'],
            unique: true,
          },
        ],
        version: '1.0.0',
      },
      [],
    );

    expect(IndexedUser.indexes).toEqual([
      {
        name: 'indexedUser_createdAt_name_idx',
        columns: ['createdAt', 'name'],
      },
      {
        name: 'indexedUser_modelName_idx',
        columns: ['modelName'],
        unique: true,
      },
    ]);

    const tableConfig = getTableConfig(IndexedUser.drizzleSchema);

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
        name: 'indexedUser_createdAt_name_idx',
        columns: ['createdAt', 'name'],
        unique: false,
      },
      {
        name: 'indexedUser_modelName_idx',
        columns: ['modelName'],
        unique: true,
      },
    ]);
  });
});
