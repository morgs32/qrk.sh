import {
  makeEffectSchema,
  makeTable,
  PrimitiveKind,
  primitives,
} from '@zerospin/schema';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import { makeModelMutations } from '../contracts/makeModelMutations.ts';

import { Model } from './makeModel.ts';
import type { IModel, InferResource } from './types.ts';

import { models } from './index.ts';

const namePropertySchema = primitives.text();

const User = models.makeVersion(
  models.makeModel({ name: 'user', abbreviation: 'usr' }),
  {
    attributes: {
      name: namePropertySchema,
    },
    indexes: [],
    version: '1.0.0',
  },
);

const Todo = models.makeVersion(
  models.makeModel({ name: 'todo', abbreviation: 'todo' }),
  {
    attributes: {
      title: primitives.text(),
      completed: primitives.boolean(),
    },
    indexes: [],
    version: '2.0.0',
  },
);

describe('makeModel', () => {
  it('constructs a canonical Model and rejects excess props', () => {
    expect(User).toBeInstanceOf(Model);
    expect(() =>
      models.makeVersion(
        models.makeModel({ name: 'user', abbreviation: 'usr' }),
        {
          attributes: { name: namePropertySchema },
          indexes: [],
          version: '1.0.0',
          // @ts-expect-error Unknown definition fields are rejected at runtime too.
          extra: true,
        },
      ),
    ).toThrow(Schema.SchemaError);
  });
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
    expect(Object.keys(User.propertiesShape)).toEqual([
      'id',
      'modelName',
      'createdAt',
      'updatedAt',
      'version',
      'name',
    ]);
    expect(User.propertiesShape).not.toHaveProperty('deletedAt');
    expect(User.version).toBe('1.0.0');
    expect(makeEffectSchema(User.attributes)).toBeDefined();
    expect(User.drizzleSchema).toBeDefined();
    expect(User.spec.modelName).toBe('user');
    expect(User.spec.abbreviation).toBe('usr');
    expect(User.spec.version).toBe('1.0.0');
    expect(User.spec.attributes).toEqual(['name']);
    expect(User.spec.attributesShape).toEqual({ name: namePropertySchema });
    expect(User.spec.propertiesShape).toMatchObject({
      name: { kind: 'text', nullable: false },
    });
    expect(() => structuredClone(User.spec)).not.toThrow();
  });

  it('snapshots factory-owned model data', () => {
    const enumValues: [string, string] = ['open', 'closed'];
    const status = primitives.enum({ values: enumValues });
    const dueAtDefault = new Date('2026-09-01T00:00:00.000Z');
    const dueAt = primitives.date({ defaultValue: dueAtDefault });
    const settingsSchema = Schema.Struct({ enabled: Schema.Boolean });
    const settings = primitives.json({ schema: settingsSchema });
    const externalTable = makeTable({
      name: 'external',
      shape: { id: primitives.primaryKey({ abbreviation: 'ext' }) },
      indexes: [],
    });
    const externalId = primitives.ref({
      table: externalTable,
      relation: 'external',
      inverse: 'snapshots',
    });
    const attributes = { dueAt, externalId, settings, status };
    const indexColumns: ['status'] = ['status'];
    const indexes = [{ name: 'by-status', columns: indexColumns }];
    const props = {
      attributes,
      indexes,
      version: '1.0.0',
    };
    const identity = { name: 'snapshot', abbreviation: 'snp' };
    const Snapshot = models.makeVersion(models.makeModel(identity), props);

    expect(Snapshot.attributes).not.toBe(attributes);
    expect(Snapshot.attributes.status).not.toBe(status);
    expect(Snapshot.attributes.status.values).not.toBe(enumValues);
    expect(Snapshot.indexes).not.toBe(indexes);
    expect(Snapshot.indexes[0]).not.toBe(indexes[0]);
    expect(Snapshot.indexes[0]?.columns).not.toBe(indexColumns);
    expect(Snapshot.attributes.settings.schema).toBe(settingsSchema);
    expect(Snapshot.attributes.dueAt.defaultValue).toBe(dueAtDefault);
    expect(Snapshot.attributes.externalId.table).toBe(externalTable);

    enumValues[0] = 'mutated';
    status.unique = true;
    indexes[0]!.name = 'mutated-index';
    indexColumns.push('status');
    Reflect.set(attributes, 'status', primitives.text());
    identity.name = 'mutated-model';

    expect(Snapshot.modelName).toBe('snapshot');
    expect(Snapshot.attributes.status.values).toEqual(['open', 'closed']);
    expect(Snapshot.attributes.status.unique).toBe(false);
    expect(Snapshot.indexes[0]).toEqual({
      name: 'by-status',
      columns: ['status'],
    });
  });

  it('snapshots independently authored version property graphs', () => {
    const currentValues: [string, string] = ['active', 'archived'];
    const historicalValues: [string, string] = ['open', 'closed'];
    const currentStatus = primitives.enum({ values: currentValues });
    const historicalStatus = primitives.enum({ values: historicalValues });
    const currentAttributes = { status: currentStatus };
    const historicalAttributes = { status: historicalStatus };
    const currentPropertiesShape = {
      id: primitives.primaryKey({ abbreviation: 'exp' }),
      modelName: primitives.text(),
      createdAt: primitives.date(),
      updatedAt: primitives.date(),
      version: primitives.text(),
      status: currentStatus,
    };
    const historicalPropertiesShape = {
      id: primitives.primaryKey({ abbreviation: 'exp' }),
      modelName: primitives.text(),
      createdAt: primitives.date(),
      updatedAt: primitives.date(),
      version: primitives.text(),
      status: historicalStatus,
    };
    const currentIndexColumns: ['status'] = ['status'];
    const historicalIndexColumns: ['status'] = ['status'];
    const currentIndexes = [
      { name: 'by-current-status', columns: currentIndexColumns },
    ];
    const historicalIndexes = [
      { name: 'by-historical-status', columns: historicalIndexColumns },
    ];
    const ownedHistory = models.makeVersion(
      models.makeModel({ name: 'explicit', abbreviation: 'exp' }),
      {
        attributes: historicalAttributes,
        propertiesShape: historicalPropertiesShape,
        indexes: historicalIndexes,
        version: '1.0.0',
      },
    );

    const Explicit = models.makeVersion(
      models.makeModel({ name: 'explicit', abbreviation: 'exp' }),
      {
        attributes: currentAttributes,
        propertiesShape: currentPropertiesShape,
        indexes: currentIndexes,
        version: '2.0.0',
      },
    );

    expect(Explicit.propertiesShape).not.toBe(currentPropertiesShape);
    expect(ownedHistory.attributes).not.toBe(historicalAttributes);
    expect(ownedHistory.propertiesShape).not.toBe(historicalPropertiesShape);
    expect(ownedHistory.indexes).not.toBe(historicalIndexes);

    currentValues[0] = 'mutated-current';
    historicalValues[0] = 'mutated-historical';
    currentPropertiesShape.modelName = primitives.text({ unique: true });
    historicalPropertiesShape.modelName = primitives.text({ unique: true });
    currentIndexes[0]!.name = 'mutated-current-index';
    historicalIndexes[0]!.name = 'mutated-historical-index';
    historicalIndexColumns.push('status');

    expect(Explicit.propertiesShape.status.values).toEqual([
      'active',
      'archived',
    ]);
    expect(Explicit.propertiesShape.modelName.unique).toBe(false);
    expect(Explicit.indexes[0]?.name).toBe('by-current-status');
    expect(ownedHistory.propertiesShape.status.values).toEqual([
      'open',
      'closed',
    ]);
    expect(ownedHistory.propertiesShape.modelName.unique).toBe(false);
    expect(ownedHistory.indexes[0]).toEqual({
      name: 'by-historical-status',
      columns: ['status'],
    });
  });

  it('resolves a cloned self reference without mutating caller data', () => {
    const parentId = primitives.self({
      nullable: true,
      relation: 'parent',
      inverse: 'children',
    });
    const attributes = { parentId };
    const Tree = models.makeVersion(
      models.makeModel({ name: 'tree', abbreviation: 'tree' }),
      {
        attributes,
        indexes: [],
        version: '1.0.0',
      },
    );

    expect(Tree.attributes.parentId).not.toBe(parentId);
    expect(Tree.attributes.parentId.table).toBe(Tree.table);
    expect(Tree.attributes.parentId.targetTableName).toBe('tree');
    expect(Object.hasOwn(Tree.attributes.parentId, 'self')).toBe(false);

    expect(Object.hasOwn(parentId, 'self')).toBe(true);
    expect(parentId.targetTableName).toBe('');
  });

  it('binds self references to each independently authored version table', () => {
    const Tree = models.makeVersion(
      models.makeModel({ name: 'tree', abbreviation: 'tree' }),
      {
        version: '2.0.0',
        indexes: [],
        attributes: {
          parentId: primitives.self({
            relation: 'parent',
            inverse: 'children',
            nullable: true,
          }),
        },
      },
    );
    const historical = models.makeVersion(
      models.makeModel({ name: 'tree', abbreviation: 'tree' }),
      {
        version: '1.0.0',
        indexes: [],
        attributes: {
          parentId: primitives.self({
            relation: 'parent',
            inverse: 'children',
            nullable: true,
          }),
        },
      },
    );
    expect(historical.attributes.parentId.table).toBe(historical.table);
    expect(historical.propertiesShape.parentId.table).toBe(historical.table);
    expect(historical.table.shape.parentId.table).toBe(historical.table);
    expect(historical.table).not.toBe(Tree.table);
    expect(historical.getVersion('1.0.0')).toBe(historical);
    expect(Object.hasOwn(historical.attributes.parentId, 'self')).toBe(false);
    expect(historical.drizzleSchema).toBeDefined();
  });

  it('structuredClone of model sans runtime schemas works', () => {
    const {
      adaptResource: _adaptResource,
      attributesSchema: _attributes,
      drizzleSchema: _drizzle,
      makeId: _makeId,
      prefixId: _prefixId,
      resourceSchema: _resourceSchema,
      getVersion: _getVersion,
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

  it('retains only its own version definition', () => {
    expect(Todo).not.toHaveProperty('historicalDefinitions');
    expect(Todo.getVersion('2.0.0')).toBe(Todo);
    expect(() => Todo.getVersion('1.0.0')).toThrow('model-version-unsupported');
  });

  it('validates and encodes the exact resource version', () => {
    const createdAt = new Date('2026-08-05T12:00:00.123Z');
    const updatedAt = new Date('2026-08-05T13:00:00.456Z');
    const currentResource = {
      id: 'todo_current',
      modelName: 'todo',
      createdAt,
      updatedAt,
      version: '2.0.0',
      title: 'Current todo',
      completed: true,
    } satisfies InferResource<typeof Todo>;
    const encodedCurrentResource = Schema.encodeUnknownSync(
      Schema.fromJsonString(Todo.resourceSchema),
    )(currentResource, { onExcessProperty: 'error' });

    expect(encodedCurrentResource).toBe(
      JSON.stringify({
        ...currentResource,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      }),
    );
    expect(
      Schema.decodeUnknownSync(Schema.fromJsonString(Todo.resourceSchema))(
        encodedCurrentResource,
        { onExcessProperty: 'error' },
      ),
    ).toEqual(currentResource);

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
    expect(() =>
      Effect.runSync(
        Todo.adaptResource({
          // @ts-expect-error runtime validation rejects unavailable versions too
          version: '1.0.0',
          resource: currentResource,
        }),
      ),
    ).toThrow('model-resource-version-unsupported');
    expect(() =>
      Effect.runSync(
        Todo.adaptResource({
          version: '2.0.0',
          resource: { ...currentResource, version: '1.0.0' },
        }),
      ),
    ).toThrow('model-current-resource-identity-invalid');
  });

  it('rejects a resource belonging to another model', () => {
    expect(() =>
      Effect.runSync(
        Todo.adaptResource({
          version: '2.0.0',
          resource: {
            id: 'todo_test',
            modelName: 'other',
            createdAt: new Date(0),
            updatedAt: new Date(0),
            version: '2.0.0',
            title: 'todo',
            completed: false,
          },
        }),
      ),
    ).toThrow('model-current-resource-identity-invalid');
  });

  it('rejects invalid current resource attributes', () => {
    expect(() =>
      Effect.runSync(
        Todo.adaptResource({
          version: '2.0.0',
          resource: {
            id: 'todo_test',
            modelName: 'todo',
            createdAt: new Date(0),
            updatedAt: new Date(0),
            version: '2.0.0',
            // @ts-expect-error runtime validation rejects invalid attributes too
            title: 42,
            completed: false,
          },
        }),
      ),
    ).toThrow('model-current-resource-invalid');
  });

  it('binds every mutation operation to the exact model version', () => {
    const mutations = [
      Effect.runSync(
        makeModelMutations(Todo).create({
          resourceId: 'todo_test',
          attributes: { title: 'Todo', completed: false },
        }),
      ),
      Effect.runSync(
        makeModelMutations(Todo).update({
          resourceId: 'todo_test',
          attributes: { completed: true },
        }),
      ),
      Effect.runSync(
        makeModelMutations(Todo).delete({ resourceId: 'todo_test' }),
      ),
    ];
    expect(mutations.map(mutation => mutation.operationName)).toEqual([
      'create',
      'update',
      'delete',
    ]);
    for (const mutation of mutations) {
      expect(mutation.model).toBe(Todo);
      expect(mutation.modelVersion).toBe('2.0.0');
    }
  });

  it('rejects selecting an unavailable version before constructing mutations', () => {
    const erasedTodo: IModel = Todo;
    expect(() => makeModelMutations(erasedTodo.getVersion('9.0.0'))).toThrow(
      'model-version-unsupported',
    );
  });

  it('rejects invalid version strings', () => {
    for (const version of ['1', '01.0.0', '1.0', '1.0.0-01']) {
      expect(() =>
        models.makeVersion(
          models.makeModel({ name: 'badSemver', abbreviation: 'bad' }),
          {
            attributes: {},
            indexes: [],
            version,
          },
        ),
      ).toThrow(/expected SemVer/);
    }
  });

  it('keeps separately authored model identities independent', () => {
    const Other = models.makeVersion(
      models.makeModel({ name: 'other', abbreviation: 'oth' }),
      {
        attributes: {},
        indexes: [],
        version: '2.0.0',
      },
    );
    expect(Other.modelName).toBe('other');
    expect(Other.abbreviation).toBe('oth');
    expect(Todo.modelName).toBe('todo');
    expect(Todo.abbreviation).toBe('todo');
  });

  it('invalid attributes (e.g. Schema instead of descriptor) throw at runtime', () => {
    expect(() =>
      models.makeVersion(
        models.makeModel({ name: 'bad', abbreviation: 'bad' }),
        {
          attributes: {
            // @ts-expect-error - reserved keys cannot be used as property keys
            id: Schema.String,
          },
          indexes: [],
          version: '1.0.0',
        },
      ),
    ).toThrow();
  });

  it('reserves the replica deletion property on authored models', () => {
    expect(() =>
      models.makeVersion(
        models.makeModel({ name: 'reservedDeletedAt', abbreviation: 'bad' }),
        {
          attributes: {
            // @ts-expect-error deletedAt is reserved replica framework state on authored models
            deletedAt: primitives.date({ nullable: true }),
          },
          indexes: [],
          version: '1.0.0',
        },
      ),
    ).toThrow(/framework property keys are reserved/);
  });

  it('allows foreign keys on attributes', () => {
    const model = models.makeVersion(
      models.makeModel({ name: 'withAbbrevId', abbreviation: 'xid' }),
      {
        attributes: {
          userId: primitives.foreignKey({ abbreviation: 'uid' }),
        },
        indexes: [],
        version: '1.0.0',
      },
    );
    expect(model.attributes.userId.kind).toBe(PrimitiveKind.ForeignKey);
  });

  it('rejects primary-key attributes because the model owns its synthesized id', () => {
    expect(() =>
      models.makeVersion(
        models.makeModel({ name: 'withExtraPrimaryKey', abbreviation: 'xpk' }),
        {
          attributes: {
            // @ts-expect-error makeModel attributes cannot declare a primary key
            versionName: primitives.primaryKey({ abbreviation: 'vrsn' }),
          },
          indexes: [],
          version: '1.0.0',
        },
      ),
    ).toThrow(/makeVersion synthesizes the model id primary key/);
  });

  it('accepts indexes on the complete properties shape', () => {
    const IndexedUser = models.makeVersion(
      models.makeModel({ name: 'indexedUser', abbreviation: 'usr' }),
      {
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

  it('returns its exact table-capable version and rejects other versions', () => {
    expect(Todo.getVersion('2.0.0')).toBe(Todo);
    expect(Todo.drizzleSchema).toHaveProperty('completed');
    expect(Todo.drizzleSchema).toHaveProperty('title');
    expect(() => Todo.getVersion('1.0.0')).toThrow('model-version-unsupported');
    expect(() => Todo.getVersion('9.0.0')).toThrow('model-version-unsupported');
  });
});
