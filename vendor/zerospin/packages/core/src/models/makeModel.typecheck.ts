import { primitives } from '@zerospin/schema';
import { type Effect } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeModelMutations } from '../contracts/makeModelMutations.ts';

import { Model } from './makeModel.ts';
import { makeReplica } from './makeReplica.ts';
import type { IModel, InferResource } from './types.ts';

import { models } from './index.ts';

const UserModel = models.makeModel({ name: 'user', abbreviation: 'usr' });

const _User = models.makeVersion(UserModel, {
  attributes: {
    name: primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});

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

declare const currentTodoResource: InferResource<typeof Todo>;
assert<
  Equals<
    Pick<typeof currentTodoResource, 'title' | 'completed'>,
    { readonly title: string; readonly completed: boolean }
  >
>();
assert<
  Equals<
    'deletedAt' extends keyof typeof currentTodoResource ? true : false,
    false
  >
>();
const encodedTodoResource = Todo.adaptResource({
  version: '2.0.0',
  resource: currentTodoResource,
});
assert<Equals<Effect.Success<typeof encodedTodoResource>['title'], string>>();
assert<
  Equals<Effect.Success<typeof encodedTodoResource>['completed'], boolean>
>();
// @ts-expect-error only the authored version is available
Todo.adaptResource({ version: '1.0.0', resource: currentTodoResource });

const TodoReplica = makeReplica({
  sourceModel: Todo,
  modelVersion: Todo.version,
  serviceName: 'todos',
});
assert<Equals<typeof TodoReplica.sourceModel, typeof Todo>>();
assert<Equals<typeof TodoReplica.serviceName, 'todos'>>();

assert<Equals<typeof TodoReplica.version, '2.0.0'>>();
assert<Equals<keyof typeof TodoReplica.attributes, 'title' | 'completed'>>();
assert<Equals<InferResource<typeof TodoReplica>['deletedAt'], Date | null>>();

declare const model: IModel;
if (Model.isReplica(model)) {
  assert<Equals<typeof model.sourceModel, IModel>>();
  assert<Equals<typeof model.serviceName, string>>();
}

// @ts-expect-error canonical Model fields are readonly
Todo.modelName = 'other';
// @ts-expect-error Model index entries are readonly
Todo.indexes[0]!.name = 'other';
// @ts-expect-error Model attribute registries are readonly
Todo.attributes.title = primitives.text();
// @ts-expect-error Model attribute descriptor entries are readonly
Todo.attributes.title.unique = true;
// @ts-expect-error Model property descriptor entries are readonly
Todo.propertiesShape.title.unique = true;
// @ts-expect-error Model table shape descriptor entries are readonly
Todo.table.shape.title.unique = true;
// @ts-expect-error models do not carry historical definitions
void Todo.historicalDefinitions;
// @ts-expect-error Model table roots are readonly
Todo.table.name = 'other';
// @ts-expect-error Model specs are readonly
Todo.spec.version = '9.0.0';

declare const currentTodoReplicaResource: InferResource<typeof TodoReplica>;
assert<
  Equals<
    Pick<
      typeof currentTodoReplicaResource,
      'title' | 'completed' | 'deletedAt'
    >,
    {
      readonly title: string;
      readonly completed: boolean;
      readonly deletedAt: Date | null;
    }
  >
>();
const encodedReplicaResource = TodoReplica.adaptResource({
  version: '2.0.0',
  resource: currentTodoReplicaResource,
});
assert<
  Equals<Effect.Success<typeof encodedReplicaResource>['title'], string>
>();
assert<
  Equals<Effect.Success<typeof encodedReplicaResource>['completed'], boolean>
>();
assert<
  Equals<
    Effect.Success<typeof encodedReplicaResource>['deletedAt'],
    Date | null
  >
>();

makeModelMutations(TodoReplica).replicate({
  id: 'todo_replication_input',
  modelName: 'todo',
  createdAt: new Date(),
  updatedAt: new Date(),
  version: '2.0.0',
  title: 'Replication input',
  completed: false,
  // @ts-expect-error live replication accepts the authoritative resource
  deletedAt: null,
});
const created = makeModelMutations(Todo).create({
  resourceId: 'todo_current',
  attributes: { title: 'Current', completed: false },
});
assert<Equals<Effect.Success<typeof created>['model']['version'], '2.0.0'>>();
assert<
  Equals<
    Effect.Success<typeof created>['operation']['attributes'],
    { readonly title: string; readonly completed: boolean }
  >
>();
makeModelMutations(Todo).create({
  resourceId: 'todo_missing_current_attribute',
  // @ts-expect-error create requires every authored attribute
  attributes: { title: 'Missing completed' },
});
makeModelMutations(Todo).create({
  resourceId: 'todo_extra_attribute',
  attributes: {
    title: 'Current',
    completed: false,
    // @ts-expect-error create excludes undeclared attributes
    unknown: true,
  },
});

models.makeVersion(
  models.makeModel({ name: 'withExtraPrimaryKey', abbreviation: 'xpk' }),
  {
    attributes: {
      // @ts-expect-error CoreTypeError — makeModel synthesizes the only primary key
      versionName: primitives.primaryKey({ abbreviation: 'vrsn' }),
    },
    indexes: [],
    version: '1.0.0',
  },
);
