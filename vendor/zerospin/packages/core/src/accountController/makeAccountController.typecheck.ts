import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeActorController } from '../actorController/makeActorController.ts';
import { makeContract } from '../contracts/makeContract.ts';
import type { IContract } from '../contracts/types.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { makeModel } from '../models/makeModel.ts';
import { makeSelection } from '../models/makeSelection.ts';
import { primitives } from '../models/primitives.ts';
import type { IAssertValidModels } from '../models/types.ts';
import type { ITypeError } from '../utils/types.ts';

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

assert<
  Equals<
    IAssertValidModels<{ list: typeof List }>,
    ITypeError<'ref "list.userId" target model "user" is not registered on controller models'>
  >
>();

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

const createUser = makeContract({
  commandName: 'createUser',
  payload: {
    id: User.primaryKey({ autogenerate: false }),
    name: primitives.text(),
  },
  mutations: null,
  version: '1.0.0',
});

const incompatibleCreateUser = makeContract({
  commandName: 'createUser',
  payload: {
    id: User.primaryKey({ autogenerate: false }),
    displayName: primitives.text(),
  },
  mutations: null,
  version: '2.0.0',
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
      authenticate: ({ makeAccountCommand }) =>
        Effect.gen(function* () {
          const createListCommand = yield* makeAccountCommand({
            contract: createList,
            payload: {
              id: List.prefixId('list-1'),
              name: 'List 1',
              userId: User.prefixId('user-1'),
            },
          });
          const createUserCommand = yield* makeAccountCommand({
            contract: createUser,
            payload: {
              id: User.prefixId('user-1'),
              name: 'User 1',
            },
          });
          yield* makeAccountCommand({
            contract: createUser,
            // @ts-expect-error — createUser payload requires name
            payload: {
              id: User.prefixId('user-1'),
            },
          });

          assert<Equals<typeof createListCommand.commandName, 'createList'>>();
          assert<Equals<typeof createUserCommand.commandName, 'createUser'>>();
          assert<Equals<typeof createUserCommand.version, '1.0.0'>>();
          assert<
            Equals<
              typeof createListCommand.payload.userId,
              ReturnType<typeof User.prefixId>
            >
          >();
          assert<
            Equals<keyof typeof createUserCommand.payload, 'id' | 'name'>
          >();

          return {
            actorId: 'usr_1' as const,
            accountId: 'acct_1' as const,
          };
        }),
    },
  },
});

assert<
  Equals<
    Extract<
      Effect.Effect.Context<
        ReturnType<typeof actor.frontends.main.authenticate>
      >,
      IContract
    >,
    typeof createList | typeof createUser
  >
>();

makeAccountController({
  name: 'user',
  version: '1.0.0',
  actorControllers: { main: actor },
  models: { list: List, user: User },
  contracts: { createList, createUser },
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
  contracts: { createUser },
});

makeAccountController({
  name: 'user',
  version: '1.0.0',
  actorControllers: { main: actor },
  models: { list: List, user: User },
  // @ts-expect-error CoreTypeError — account contracts must include every actor authentication contract
  contracts: { createList },
});

makeAccountController({
  name: 'user',
  version: '1.0.0',
  actorControllers: { main: actor },
  models: { list: List, user: User },
  // @ts-expect-error CoreTypeError — account authentication contracts must match exactly
  contracts: { createList, createUser: incompatibleCreateUser },
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
