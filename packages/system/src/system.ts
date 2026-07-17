import { makeAccountController } from '@zerospin/core/accountController/makeAccountController';
import { makeActorController } from '@zerospin/core/actorController/makeActorController';
import { makeAuthorize } from '@zerospin/core/authorize/makeAuthorize';
import { makeContract } from '@zerospin/core/contracts/makeContract';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeGuard } from '@zerospin/core/guards/makeGuard';
import { makeModelIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeModel } from '@zerospin/core/models/makeModel';
import { makeSelection } from '@zerospin/core/models/makeSelection';
import { primitives } from '@zerospin/core/models/primitives';
import type { IServiceControllers } from '@zerospin/core/service/types';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import { ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

export const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      actorId: primitives.opaqueId({ abbreviation: 'actr', unique: true }),
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

export const main = makeFrontendController({
  contracts: {
    deleteList,
    createList,
    createItem,
    moveItem,
    updateList,
  },
  accountName: 'user',
  actorName: 'main',
  frontendName: 'main',
  version: '1.0.0',
  systemName: 'system-worker',
  models: {
    account: Account,
    list: List,
    item: Item,
    user: User,
  },
  signature: Schema.Struct({
    userId: makeModelIdSchema(User),
  }),
  guards: {
    createList: [
      makeGuard({
        contract: createList,
        models: {
          list: List,
          user: User,
        },
        actor: 'user',
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

export const mainAuthorize = makeAuthorize({
  frontendController: main,
  authorize: Effect.fn('mainAuthorize')(function* ({ actorId, db }) {
    const user = db.query.user
      .findFirst({
        where: { actorId: { eq: actorId } },
      })
      .sync();
    if (user === undefined) {
      return yield* new ZerospinError({
        code: 'user-not-found',
        message: `User ${actorId} was not found`,
      });
    }
  }),
});

export const mainActor = makeActorController({
  name: 'main',
  version: '1.0.0',
  models: {
    user: User,
    list: List,
    item: Item,
    account: Account,
  },
  selections: {
    user: makeSelection({
      model: User,
      where: ({ actorId }) => ({ actorId }),
    }),
    list: makeSelection({
      model: List,
      where: ({ actorId }) => ({
        user: { actorId },
      }),
    }),
    item: makeSelection({
      model: Item,
      where: ({ actorId }) => ({
        list: { user: { actorId } },
      }),
    }),
    account: makeSelection({
      model: Account,
      where: () => ({}),
    }),
  },
  frontends: {
    main: {
      frontendController: main,
      authenticate: props =>
        Effect.gen(function* () {
          const user = props.db.query.user
            .findFirst({
              where: { id: { eq: props.signature.userId } },
            })
            .sync();
          if (user === undefined) {
            return yield* new ZerospinError({
              code: 'user-not-found',
              message: `User ${props.signature.userId} was not found`,
            });
          }
          return {
            actorId: user.actorId,
            accountId: 'acct_1' as const,
          };
        }),
    },
  },
  authorize: mainAuthorize,
});

export const userAccount = makeAccountController({
  name: 'user',
  version: '1.0.0',
  actorControllers: {
    main: mainActor,
  },
  models: {
    user: User,
    list: List,
    item: Item,
    account: Account,
  },
  contracts: mainActor.frontends.main!.contracts,
});

const serviceControllers: IServiceControllers = {};

export const system = makeSystem({
  accountControllers: {
    user: userAccount,
  },
  serviceControllers,
  name: 'system-worker',
  version: '1.0.1',
});
