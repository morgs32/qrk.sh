/*
 * System-worker annotation:
 * Builds fixture data for system-worker tests and examples.
 * Fixture changes should preserve the domain relationships that repo and API tests rely on.
 */

import { makeSignature } from '@zerospin/core/authentication/makeSignature';
import { makeContract } from '@zerospin/core/contracts/makeContract';
import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeGuard } from '@zerospin/core/guards/makeGuard';
import { makeModelIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeModel } from '@zerospin/core/models/makeModel';
import { makeReplica } from '@zerospin/core/models/makeReplica';
import { makeSelection } from '@zerospin/core/models/makeSelection';
import type { IAggregateId } from '@zerospin/core/models/types';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

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

const Product = makeModel(
  {
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

const ProductReplica = makeReplica({
  sourceModel: Product,
  serviceName: 'app',
});

const Stock = makeModel(
  {
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

const StockReplica = makeReplica({
  sourceModel: Stock,
  serviceName: 'inventory',
});

const Preference = makeModel(
  {
    abbreviation: 'pref',
    modelName: 'preference',
    attributes: {
      settings: primitives.json({
        schema: Schema.Struct({ theme: Schema.String }),
      }),
    },
    indexes: [],
    version: '2.0.0',
  },
  [
    {
      abbreviation: 'pref',
      modelName: 'preference',
      attributes: { theme: primitives.text() },
      indexes: [],
      version: '1.0.0',
      adaptResource: ({ resource }) =>
        Effect.succeed({
          id: resource.id,
          modelName: resource.modelName,
          createdAt: resource.createdAt,
          updatedAt: resource.updatedAt,
          version: '1.0.0',
          theme: resource.settings.theme,
        }),
    },
  ],
);

const CatalogSettings = makeModel(
  {
    abbreviation: 'scfg',
    modelName: 'catalogSettings',
    attributes: {
      settings: primitives.json({
        schema: Schema.Struct({ currency: Schema.String }),
      }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const createUser = makeContract({
  commandName: 'createUser',
  payload: {
    id: User.primaryKey({ autogenerate: false }),
    name: primitives.text(),
  },
  mutations: Schema.Struct({
    created: User.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: User.create('1.0.0', {
        resourceId: payload.id,
        attributes: {
          name: payload.name,
        },
      }),
    }),
  version: '1.0.0',
});

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

export const renameList = makeContract(
  {
    commandName: 'renameList',
    payload: {
      id: List.primaryKey({ autogenerate: false }),
      name: primitives.text(),
      userId: User.primaryKey({ autogenerate: false }),
    },
    mutations: Schema.Struct({
      updated: List.updateMutation('1.0.0'),
    }),
    program: ({ payload }) =>
      Effect.all({
        updated: List.update('1.0.0', {
          resourceId: payload.id,
          attributes: { name: payload.name, userId: payload.userId },
        }),
      }),
    version: '1.1.0',
  },
  [
    {
      commandName: 'renameList',
      payload: {
        id: List.primaryKey({ autogenerate: false }),
        label: primitives.text(),
        userId: User.primaryKey({ autogenerate: false }),
      },
      adaptPayload: ({ payload }) =>
        Effect.succeed({
          id: payload.id,
          name: payload.label,
          userId: payload.userId,
        }),
      version: '1.0.0',
    },
  ],
);

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

const updateProduct = makeContract(
  {
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
    version: '1.1.0',
  },
  [
    {
      commandName: 'updateProduct',
      payload: {
        id: Product.primaryKey({ autogenerate: false }),
        label: primitives.text(),
      },
      adaptPayload: ({ payload }) =>
        Effect.succeed({ id: payload.id, name: payload.label }),
      version: '1.0.0',
    },
  ],
);

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
    replicated: ProductReplica.replicateResourceMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      replicated: ProductReplica.replicateResource('1.0.0', {
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
    replicated: ProductReplica.replicateResourceMutation('1.0.0'),
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
      replicated: ProductReplica.replicateResource('1.0.0', {
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
    product: ProductReplica.replicateResourceMutation('1.0.0'),
    stock: StockReplica.replicateResourceMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      product: ProductReplica.replicateResource('1.0.0', {
        resource: payload.product,
      }),
      stock: StockReplica.replicateResource('1.0.0', {
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
    createList,
    createItem,
    createListAndReplicateProduct,
    replicateProduct,
    replicateProductAndStock,
    deleteList,
    moveItem,
    renameList,
    updateList,
  },
  aggregateName: 'user',
  frontendName: 'main',
  systemName: 'system-worker',
  models: {
    account: Account,
    list: List,
    item: Item,
    product: ProductReplica,
    preference: Preference,
    stock: StockReplica,
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
    updateList: [
      makeGuard({
        contract: updateList,
        models: {
          list: List,
          user: User,
        },
        program: Effect.fn('updateListGuard')(function* ({ db, payload }) {
          const list = yield* Effect.try({
            try: () =>
              db.query.list
                .findFirst({
                  where: { id: { eq: payload.id } },
                })
                .sync(),
            catch: cause =>
              new ZerospinError({
                code: 'fixture-list-query-failed',
                message: `Failed to query list ${payload.id} during guard evaluation.`,
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
          });
          if (list === undefined) {
            return yield* new ZerospinError({
              code: 'list-not-found',
              message: `List ${payload.id} was not found`,
            });
          }
          if (payload.name === 'stale-at-commit') {
            yield* Effect.sleep('500 millis');
          }
        }),
      }),
    ],
  },
});

export const mainModels = getFrontendDbModels(main);

const products = makeFrontendController({
  systemName: 'system-worker',
  serviceName: 'app',
  frontendName: 'products',
  models: { catalogSettings: CatalogSettings, product: Product },
});

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
      }) => {
        const { db, userId: requestedUserId } = props;
        return Effect.gen(function* () {
          const userId = yield* Schema.decodeUnknownEffect(
            makeModelIdSchema(User),
          )(requestedUserId).pipe(
            mapParseError({
              code: 'fixture-user-id-invalid',
              prefix: 'Failed to decode the fixture authorization userId',
            }),
          );
          const user = yield* Effect.try({
            try: () =>
              db.query.user
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
              message: `User ${requestedUserId} was not found`,
            });
          }
          return yield* Effect.void;
        });
      },
      models: {
        user: User,
        list: List,
        item: Item,
        account: Account,
        preference: Preference,
        product: ProductReplica,
        stock: StockReplica,
      },
      contracts: {
        createUser,
        ...main.contracts,
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
        preference: makeSelection({
          model: Preference,
          where: () => ({}),
        }),
        product: makeSelection({
          model: ProductReplica,
          where: () => ({}),
        }),
        stock: makeSelection({
          model: StockReplica,
          where: () => ({}),
        }),
      },
      queries: {
        getProducts: { service: 'app', query: 'getProducts' },
      },
      frontends: {
        main: {
          controller: main,
        },
      },
    },
  },
  services: {
    app: {
      authorize: (props: {
        frontendName: 'products';
        userId: string;
        db: Readonly<
          Pick<
            IDb<
              IResourceDbConfig<
                { product: typeof Product },
                Record<never, never>
              >
            >,
            'query'
          >
        >;
      }) =>
        Effect.try({
          try: () => props.db.query.product.findMany().sync(),
          catch: cause =>
            new ZerospinError({
              code: 'fixture-products-authorization-query-failed',
              message: 'Failed to query products during authorization.',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
        }).pipe(Effect.asVoid),
      models: { catalogSettings: CatalogSettings, product: Product },
      contracts: { createProduct, deleteProduct, updateProduct },
      queries: {
        getProducts: {
          paramsSchema: Schema.Struct({}),
          query: Effect.fn('getProducts')(function* ({
            db,
          }: {
            db: Readonly<
              Pick<
                IDb<
                  IResourceDbConfig<
                    { product: typeof Product },
                    Record<never, never>
                  >
                >,
                'query'
              >
            >;
          }) {
            return yield* Effect.try({
              try: () =>
                db.query.product
                  .findMany({
                    columns: {
                      id: true,
                      name: true,
                    },
                  })
                  .sync(),
              catch: cause =>
                new ZerospinError({
                  code: 'fixture-products-query-failed',
                  message: 'Failed to query fixture products.',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
            });
          }),
        },
      },
      frontends: {
        products: {
          controller: products,
        },
      },
    },
    inventory: {
      models: { stock: Stock },
      contracts: { createStock, updateStock },
      queries: {},
      frontends: {},
    },
  },
  name: 'system-worker',
  version: '1.0.1',
});
