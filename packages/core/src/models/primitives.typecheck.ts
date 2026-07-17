import { makeContract } from '../contracts/makeContract.ts';

import { makeModel } from './makeModel.ts';
import { makeTable } from './makeTable.ts';
import { primitives } from './primitives.ts';

const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const refDescriptor = primitives.ref({
  table: User.table,
  relation: 'user',
  inverse: 'owner',
});

void (refDescriptor.table satisfies typeof User.table);
void refDescriptor.table.shape.name;
void (refDescriptor.nullable satisfies false);
void (refDescriptor.unique satisfies false);

const nullableUniqueRefDescriptor = primitives.ref({
  table: User.table,
  relation: 'nullableUser',
  inverse: 'nullableOwner',
  nullable: true,
  unique: true,
});

void (nullableUniqueRefDescriptor.nullable satisfies true);
void (nullableUniqueRefDescriptor.unique satisfies true);

const selfRefTable = makeTable({
  name: 'selfRefTable',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'self' }),
    parentId: primitives.self({
      relation: 'parent',
      inverse: 'children',
      nullable: true,
      unique: true,
    }),
  },
});

void (selfRefTable.shape.parentId.nullable satisfies true);
void (selfRefTable.shape.parentId.unique satisfies true);
void (selfRefTable.shape.parentId.relation satisfies 'parent');
void (selfRefTable.shape.parentId.inverse satisfies 'children');

// @ts-expect-error CoreTypeError — model payload keys require an explicit autogeneration decision
User.primaryKey({});

makeContract({
  commandName: 'rawPrimaryKeyPayload',
  payload: {
    // @ts-expect-error CoreTypeError — raw table primary keys are not payload descriptors
    id: primitives.primaryKey({ abbreviation: 'raw' }),
  },
  mutations: null,
  version: '1.0.0',
});

makeContract({
  commandName: 'refPayload',
  payload: {
    // @ts-expect-error CoreTypeError — refs belong to persisted table/model shapes
    userId: primitives.ref({
      table: User.table,
      relation: 'user',
      inverse: 'commands',
    }),
  },
  mutations: null,
  version: '1.0.0',
});

// @ts-expect-error CoreTypeError — primary keys do not accept nullable state
primitives.primaryKey({ abbreviation: 'bad', nullable: true });

// @ts-expect-error CoreTypeError — refs require a forward relation name
primitives.ref({ table: User.table, inverse: 'commands' });

// @ts-expect-error CoreTypeError — refs require an inverse relation name
primitives.ref({ table: User.table, relation: 'user' });

const noPrimaryKeyTable = makeTable({
  name: 'noPrimaryKey',
  shape: {
    name: primitives.text(),
  },
});

primitives.ref({
  // @ts-expect-error CoreTypeError — ref targets require one primary key
  table: noPrimaryKeyTable,
  relation: 'missingKey',
  inverse: 'commands',
});

const multiplePrimaryKeysTable = makeTable({
  name: 'multiplePrimaryKeys',
  shape: {
    firstId: primitives.primaryKey({ abbreviation: 'fst' }),
    secondId: primitives.primaryKey({ abbreviation: 'snd' }),
  },
});

primitives.ref({
  // @ts-expect-error CoreTypeError — ref targets require only one primary key
  table: multiplePrimaryKeysTable,
  relation: 'multipleKeys',
  inverse: 'commands',
});
