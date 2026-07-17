import { Effect, Schema } from 'effect';

import { makeActorController } from '../actorController/makeActorController.ts';
import { makeContract } from '../contracts/makeContract.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { makeModel } from '../models/makeModel.ts';
import { makeSelection } from '../models/makeSelection.ts';
import { primitives } from '../models/primitives.ts';

import { makeAccountController } from './makeAccountController.ts';

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

const List = makeModel(
  {
    abbreviation: 'lst',
    modelName: 'list',
    attributes: {
      name: primitives.text(),
      userId: primitives.ref({
        table: User.table,
        relation: 'user',
        inverse: 'lists',
      }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const createList = makeContract({
  commandName: 'createList',
  payload: {
    id: List.primaryKey({ autogenerate: false }),
    name: primitives.text(),
    userId: User.primaryKey({ autogenerate: false }),
  },
  mutations: null,
  version: '1.0.0',
});

const frontend = makeFrontendController({
  contracts: { createList },
  accountName: 'user',
  actorName: 'main',
  frontendName: 'main',
  version: '1.0.0',
  systemName: 'test',
  models: { list: List, user: User },
  signature: Schema.Struct({ userId: Schema.String }),
});

const actor = makeActorController({
  name: 'main',
  version: '1.0.0',
  models: { list: List, user: User },
  selections: {
    list: makeSelection({ model: List }),
    user: makeSelection({ model: User }),
  },
  frontends: {
    main: {
      frontendController: frontend,
      authenticate: () =>
        Effect.succeed({
          actorId: 'usr_1' as const,
          accountId: 'acct_1' as const,
        }),
    },
  },
});

makeAccountController({
  name: 'user',
  version: '1.0.0',
  actorControllers: { main: actor },
  models: { list: List, user: User },
  contracts: actor.frontends.main.contracts,
});

makeAccountController({
  name: 'user',
  version: '1.0.0',
  actorControllers: {
    // @ts-expect-error CoreTypeError — key must match actor controller name
    wrong: actor,
  },
  models: { list: List, user: User },
  contracts: actor.frontends.main.contracts,
});

makeAccountController({
  name: 'user',
  version: '1.0.0',
  actorControllers: { main: actor },
  // @ts-expect-error CoreTypeError — account models must include every actor model
  models: { user: User },
  contracts: actor.frontends.main.contracts,
});

makeAccountController({
  name: 'user',
  version: '1.0.0',
  actorControllers: { main: actor },
  models: { list: List, user: User },
  // @ts-expect-error CoreTypeError — account contracts must include every frontend binding contract
  contracts: {},
});

const VersionedList = makeModel(
  {
    abbreviation: 'vlst',
    modelName: 'versionedList',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '2.0.0',
  },
  [
    {
      abbreviation: 'vlst',
      modelName: 'versionedList',
      attributes: {
        name: primitives.text(),
      },
      indexes: [],
      version: '1.0.0',
    },
  ],
);

makeAccountController({
  name: 'user',
  version: '2.0.0',
  actorControllers: {},
  models: { versionedList: VersionedList },
  contracts: {},
  mutationAdapters: {
    versionedList: {
      create: [
        {
          source: VersionedList.createMutation('1.0.0'),
          destination: VersionedList.createMutation('2.0.0'),
          adapter: mutation => {
            void mutation.operation.attributes.name;
            return Effect.succeed({
              ...mutation,
              modelVersion: '2.0.0',
            });
          },
        },
      ],
    },
  },
});

makeAccountController({
  name: 'user',
  version: '2.0.0',
  actorControllers: {},
  models: { versionedList: VersionedList },
  contracts: {},
  mutationAdapters: {
    versionedList: {
      create: [
        {
          source: VersionedList.createMutation('1.0.0'),
          destination: VersionedList.createMutation('2.0.0'),
          // @ts-expect-error mutation adapters must not require runtime services
          adapter: mutation =>
            VersionedList.makeId().pipe(
              Effect.map(() => ({
                ...mutation,
                modelVersion: '2.0.0',
              })),
            ),
        },
      ],
    },
  },
});
