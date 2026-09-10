import { makeTable, primitives, type PrimitiveKind } from './index.ts';

const userTable = makeTable({
  name: 'user',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'usr' }),
    name: primitives.text(),
  },
});

const refDescriptor = primitives.ref({
  table: userTable,
  relation: 'user',
  inverse: 'owner',
});

void (refDescriptor.table satisfies typeof userTable);
void refDescriptor.table.shape.name;
void (refDescriptor.nullable satisfies false);
void (refDescriptor.unique satisfies false);

const nullableUniqueRefDescriptor = primitives.ref({
  table: userTable,
  relation: 'nullableUser',
  inverse: 'nullableOwner',
  nullable: true,
  unique: true,
});

void (nullableUniqueRefDescriptor.nullable satisfies true);
void (nullableUniqueRefDescriptor.unique satisfies true);

const numericBlockTable = makeTable({
  name: 'numericBlock',
  shape: {
    blockIndex: primitives.integer({ primaryKey: true }),
  },
});

const numericBlockRefDescriptor = primitives.ref({
  table: numericBlockTable,
  relation: 'block',
  inverse: 'commands',
});

void (numericBlockRefDescriptor.targetKind satisfies PrimitiveKind.Integer);
void (numericBlockRefDescriptor.targetColumnName satisfies 'blockIndex');
void (numericBlockRefDescriptor.nullable satisfies false);

const nullableNumericBlockRefDescriptor = primitives.ref({
  table: numericBlockTable,
  relation: 'nullableBlock',
  inverse: 'nullableCommands',
  nullable: true,
});

void (nullableNumericBlockRefDescriptor.nullable satisfies true);

const nullableTextWithNullDefault = primitives.text({
  nullable: true,
  defaultValue: null,
});

void (nullableTextWithNullDefault.nullable satisfies true);
void (nullableTextWithNullDefault.defaultValue satisfies null | undefined);

// @ts-expect-error CoreTypeError — null text defaults require nullable text
primitives.text({ defaultValue: null });

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

// @ts-expect-error CoreTypeError — primary keys do not accept nullable state
primitives.primaryKey({ abbreviation: 'bad', nullable: true });

// @ts-expect-error CoreTypeError — refs require a forward relation name
primitives.ref({ table: userTable, inverse: 'commands' });

// @ts-expect-error CoreTypeError — refs require an inverse relation name
primitives.ref({ table: userTable, relation: 'user' });

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

const nonPrimaryIntegerTable = makeTable({
  name: 'nonPrimaryInteger',
  shape: {
    index: primitives.integer(),
  },
});

primitives.ref({
  // @ts-expect-error CoreTypeError — ordinary integer columns are not ref targets
  table: nonPrimaryIntegerTable,
  relation: 'nonPrimaryInteger',
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

const structuralTable = {
  name: 'structural',
  shape: { id: primitives.primaryKey({ abbreviation: 'str' }) },
  indexes: [],
};
primitives.ref({
  // @ts-expect-error Table construction cannot be bypassed with a structural object.
  table: structuralTable,
  relation: 'structural',
  inverse: 'sources',
});
void (userTable.name satisfies 'user');
void (refDescriptor.targetColumnName satisfies 'id');
