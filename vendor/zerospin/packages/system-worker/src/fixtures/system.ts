/*
 * System-worker annotation:
 * Builds fixture data for system-worker tests and examples.
 * Fixture changes should preserve the domain relationships that repo and API tests rely on.
 */

import { makeAccountController } from '@zerospin/core/accountController/makeAccountController';
import { makeActorApi } from '@zerospin/core/actorController/makeActorApi';
import { makeActorController } from '@zerospin/core/actorController/makeActorController';
import { makeAuthorize } from '@zerospin/core/authorize/makeAuthorize';
import { makeContract } from '@zerospin/core/contracts/makeContract';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeGuard } from '@zerospin/core/guards/makeGuard';
import { makeModelIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeModel } from '@zerospin/core/models/makeModel';
import { makeSelection } from '@zerospin/core/models/makeSelection';
import { makeServiceModel } from '@zerospin/core/models/makeServiceModel';
import { primitives } from '@zerospin/core/models/primitives';
import { makeServiceController } from '@zerospin/core/service/makeServiceController';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import { ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

const User = makeModel(
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

const Account = makeModel(
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

const Item = makeModel(
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

const Product = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'prd',
    modelName: 'product',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const Stock = makeServiceModel(
  {
    serviceName: 'inventory',
    abbreviation: 'stk',
    modelName: 'stock',
    attributes: {
      quantity: primitives.integer(),
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

const createItem = makeContract({
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

const createProduct = makeContract({
  commandName: 'createProduct',
  payload: {
    id: Product.primaryKey({ autogenerate: false }),
    name: primitives.text(),
  },
  mutations: Schema.Struct({
    created: Product.createMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id, name } = payload;
    return Effect.all({
      created: Product.create('1.0.0', {
        resourceId: id,
        attributes: { name },
      }),
    });
  },
  version: '1.0.0',
});

const updateProduct = makeContract({
  commandName: 'updateProduct',
  payload: {
    id: Product.primaryKey({ autogenerate: false }),
    name: primitives.text(),
  },
  mutations: Schema.Struct({
    updated: Product.updateMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id, name } = payload;
    return Effect.all({
      updated: Product.update('1.0.0', {
        resourceId: id,
        attributes: { name },
      }),
    });
  },
  version: '1.0.0',
});

const deleteProduct = makeContract({
  commandName: 'deleteProduct',
  payload: {
    id: Product.primaryKey({ autogenerate: false }),
  },
  mutations: Schema.Struct({
    deleted: Product.deleteMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      deleted: Product.delete('1.0.0', {
        resourceId: payload.id,
      }),
    }),
  version: '1.0.0',
});

const replicateProduct = makeContract({
  commandName: 'replicateProduct',
  payload: {
    product: primitives.json({ schema: Product.resourceSchema }),
  },
  mutations: Schema.Struct({
    replicated: Product.replicateResourceMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      replicated: Product.replicateResource('1.0.0', {
        resource: payload.product,
      }),
    }),
  version: '1.0.0',
});

const createListAndReplicateProduct = makeContract({
  commandName: 'createListAndReplicateProduct',
  payload: {
    id: List.primaryKey({ autogenerate: false }),
    name: primitives.text(),
    userId: User.primaryKey({ autogenerate: false }),
    product: primitives.json({ schema: Product.resourceSchema }),
  },
  mutations: Schema.Struct({
    created: List.createMutation('1.0.0'),
    replicated: Product.replicateResourceMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: List.create('1.0.0', {
        resourceId: payload.id,
        attributes: {
          name: payload.name,
          userId: payload.userId,
        },
      }),
      replicated: Product.replicateResource('1.0.0', {
        resource: payload.product,
      }),
    }),
  version: '1.0.0',
});

const createStock = makeContract({
  commandName: 'createStock',
  payload: {
    id: Stock.primaryKey({ autogenerate: false }),
    quantity: primitives.integer(),
  },
  mutations: Schema.Struct({
    created: Stock.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: Stock.create('1.0.0', {
        resourceId: payload.id,
        attributes: { quantity: payload.quantity },
      }),
    }),
  version: '1.0.0',
});

const updateStock = makeContract({
  commandName: 'updateStock',
  payload: {
    id: Stock.primaryKey({ autogenerate: false }),
    quantity: primitives.integer(),
  },
  mutations: Schema.Struct({
    updated: Stock.updateMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      updated: Stock.update('1.0.0', {
        resourceId: payload.id,
        attributes: { quantity: payload.quantity },
      }),
    }),
  version: '1.0.0',
});

const replicateProductAndStock = makeContract({
  commandName: 'replicateProductAndStock',
  payload: {
    product: primitives.json({ schema: Product.resourceSchema }),
    stock: primitives.json({ schema: Stock.resourceSchema }),
  },
  mutations: Schema.Struct({
    product: Product.replicateResourceMutation('1.0.0'),
    stock: Stock.replicateResourceMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      product: Product.replicateResource('1.0.0', {
        resource: payload.product,
      }),
      stock: Stock.replicateResource('1.0.0', {
        resource: payload.stock,
      }),
    }),
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

export const main = makeFrontendController({
  contracts: {
    createList,
    createItem,
    createListAndReplicateProduct,
    replicateProduct,
    replicateProductAndStock,
    deleteList,
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
    product: Product,
    stock: Stock,
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
    updateList: [
      makeGuard({
        contract: updateList,
        models: {
          list: List,
          user: User,
        },
        actor: 'user',
        program: Effect.fn('updateListGuard')(function* ({ db, payload }) {
          const list = db.query.list
            .findFirst({
              where: { id: { eq: payload.id } },
            })
            .sync();
          if (list === undefined) {
            return yield* new ZerospinError({
              code: 'list-not-found',
              message: `List ${payload.id} was not found`,
            });
          }
        }),
      }),
    ],
  },
});

export const mainModels = getFrontendDbModels(main);

const mainAuthorize = makeAuthorize({
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

const appService = makeServiceController({
  name: 'app',
  version: '1.0.0',
  models: {
    product: Product,
  },
  contracts: {
    createProduct,
    deleteProduct,
    updateProduct,
  },
  queries: {
    getProducts: {
      paramsSchema: Schema.Struct({}),
      query: Effect.fn('getProducts')(function* ({ db }) {
        yield* Effect.void;

        return db.query.product
          .findMany({
            columns: {
              id: true,
              name: true,
            },
          })
          .sync();
      }),
    },
  },
});

const inventoryService = makeServiceController({
  name: 'inventory',
  version: '1.0.0',
  models: {
    stock: Stock,
  },
  contracts: {
    createStock,
    updateStock,
  },
  queries: {},
});

const mainApi = makeActorApi({
  getProducts: appService.queries.getProducts,
});

export const mainActor = makeActorController({
  name: 'main',
  version: '1.0.0',
  api: mainApi,
  models: {
    user: User,
    list: List,
    item: Item,
    account: Account,
    product: Product,
    stock: Stock,
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
    product: makeSelection({
      model: Product,
      where: () => ({}),
    }),
    stock: makeSelection({
      model: Stock,
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
    product: Product,
    stock: Stock,
  },
  contracts: mainActor.frontends.main!.contracts,
});

export const system = makeSystem({
  accountControllers: {
    user: userAccount,
  },
  serviceControllers: {
    app: appService,
    inventory: inventoryService,
  },
  name: 'system-worker',
  version: '1.0.1',
});
