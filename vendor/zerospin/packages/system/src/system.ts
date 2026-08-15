import { makeSignature } from '@zerospin/core/authentication/makeSignature';
import { makeContract } from '@zerospin/core/contracts/makeContract';
import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeGuard } from '@zerospin/core/guards/makeGuard';
import { makeModelIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeModel } from '@zerospin/core/models/makeModel';
import { makeSelection } from '@zerospin/core/models/makeSelection';
import { primitives } from '@zerospin/core/models/primitives';
import type { IAggregateId } from '@zerospin/core/models/types';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

export const User = makeModel(
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

export const Account = makeModel(
  {
    abbreviation: 'acct',
    modelName: 'account',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

export const List = makeModel(
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

export const Item = makeModel(
  {
    abbreviation: 'tsk',
    modelName: 'item',
    attributes: {
      listId: primitives.ref({
        table: List.table,
        relation: 'list',
        inverse: 'items',
      }),
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

export const createList = makeContract({
  commandName: 'createList',
  payload: {
    id: List.primaryKey({ autogenerate: false }),
    name: primitives.text(),
    userId: User.primaryKey({ autogenerate: false }),
  },
  mutations: Schema.Struct({
    created: List.createMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id, name, userId } = payload;
    return Effect.all({
      created: List.create('1.0.0', {
        resourceId: id,
        attributes: {
          name,
          userId,
        },
      }),
    });
  },
  version: '1.0.0',
});

export const createItem = makeContract({
  commandName: 'createItem',
  payload: {
    id: Item.primaryKey({ autogenerate: false }),
    listId: List.primaryKey({ autogenerate: false }),
    name: primitives.text(),
  },
  mutations: Schema.Struct({
    created: Item.createMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id, listId, name } = payload;
    return Effect.all({
      created: Item.create('1.0.0', {
        resourceId: id,
        attributes: {
          listId,
          name,
        },
      }),
    });
  },
  version: '1.0.0',
});

export const deleteList = makeContract({
  commandName: 'deleteList',
  payload: {
    id: List.primaryKey({ autogenerate: false }),
  },
  mutations: Schema.Struct({
    deleted: List.deleteMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id } = payload;
    return Effect.all({
      deleted: List.delete('1.0.0', {
        resourceId: id,
      }),
    });
  },
  version: '1.0.0',
});

export const moveItem = makeContract({
  commandName: 'moveItem',
  payload: {
    id: Item.primaryKey({ autogenerate: false }),
    prevListId: List.primaryKey({ autogenerate: false }),
    nextListId: List.primaryKey({ autogenerate: false }),
  },
  mutations: Schema.Struct({
    moved: Item.moveMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id, prevListId, nextListId } = payload;
    return Effect.all({
      moved: Item.move('1.0.0', {
        resourceId: id,
        property: 'listId',
        prevId: prevListId,
        nextId: nextListId,
      }),
    });
  },
  version: '1.0.0',
});

export const updateList = makeContract({
  commandName: 'updateList',
  payload: {
    id: List.primaryKey({ autogenerate: false }),
    name: primitives.text(),
    userId: User.primaryKey({ autogenerate: false }),
  },
  mutations: Schema.Struct({
    updated: List.updateMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id, name, userId } = payload;
    return Effect.all({
      updated: List.update('1.0.0', {
        resourceId: id,
        attributes: { name, userId },
      }),
    });
  },
  version: '1.0.0',
});

export const authenticationSignature = makeSignature(
  {
    version: '1.0.0',
    schema: Schema.Struct({
      userId: makeModelIdSchema(User),
    }),
  },
  [],
);

export const main = makeFrontendController({
  contracts: {
    deleteList,
    createList,
    createItem,
    moveItem,
    updateList,
  },
  aggregateName: 'user',
  frontendName: 'main',
  systemName: 'system-worker',
  models: {
    account: Account,
    list: List,
    item: Item,
    user: User,
  },
  guards: {
    createList: [
      makeGuard({
        contract: createList,
        models: {
          list: List,
          user: User,
        },
        program: Effect.fn('createListGuard')(function* ({ payload }) {
          if (payload.name === 'invalid-name') {
            return yield* new ZerospinError({
              code: 'list-name-rejected',
              message: `List name is rejected: ${payload.name}`,
            });
          }
        }),
      }),
    ],
  },
});

export const mainModels = getFrontendDbModels(main);

export const system = makeSystem({
  authentication: {
    signature: authenticationSignature,
    authenticate: ({ signature }) => Effect.succeed(signature.userId),
  },
  aggregates: {
    user: {
      authorize: (props: {
        frontendName: 'main';
        userId: string;
        aggregateId: IAggregateId;
        db: Readonly<
          Pick<
            IDb<IResourceDbConfig<typeof mainModels, Record<never, never>>>,
            'query'
          >
        >;
      }) =>
        Effect.gen(function* () {
          const userId = yield* Schema.decodeUnknown(makeModelIdSchema(User))(
            props.userId,
          ).pipe(
            mapParseError({
              code: 'fixture-user-id-invalid',
              prefix: 'Failed to decode the fixture authorization userId',
            }),
          );
          const user = yield* Effect.try({
            try: () =>
              props.db.query.user
                .findFirst({
                  where: { id: { eq: userId } },
                })
                .sync(),
            catch: cause =>
              new ZerospinError({
                code: 'fixture-user-query-failed',
                message:
                  'Failed to query the fixture user during authentication.',
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
          });
          if (user === undefined) {
            return yield* new ZerospinError({
              code: 'user-not-found',
              message: `User ${props.userId} was not found`,
            });
          }
          return yield* Effect.void;
        }),
      models: {
        user: User,
        list: List,
        item: Item,
        account: Account,
      },
      contracts: {
        deleteList,
        createList,
        createItem,
        moveItem,
        updateList,
      },
      selections: {
        user: makeSelection({
          model: User,
          where: ({ userId }) => ({ id: userId }),
        }),
        list: makeSelection({
          model: List,
          where: ({ userId }) => ({
            user: { id: userId },
          }),
        }),
        item: makeSelection({
          model: Item,
          where: ({ userId }) => ({
            list: { user: { id: userId } },
          }),
        }),
        account: makeSelection({
          model: Account,
          where: () => ({}),
        }),
      },
      frontends: {
        main: {
          controller: main,
        },
      },
    },
  },
  services: {},
  name: 'system-worker',
  version: '1.0.1',
});
