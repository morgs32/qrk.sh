import { aggregates } from '@zerospin/core/aggregate/index';
/*
 * System-worker annotation:
 * Builds fixture data for system-worker tests and examples.
 * Fixture changes should preserve the domain relationships that repo and API tests rely on.
 */
import { authentication } from '@zerospin/core/authentication/index';
import { contracts } from '@zerospin/core/contracts/index';
import type { InferCommand } from '@zerospin/core/contracts/types';
import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { models } from '@zerospin/core/models/index';
import { makeModelIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeReplica } from '@zerospin/core/models/makeReplica';
import { makeSelection } from '@zerospin/core/models/makeSelection';
import type { IAggregateId } from '@zerospin/core/models/types';
import { makeService } from '@zerospin/core/service/makeService';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

const UserModel = models.makeModel({ name: 'user', abbreviation: 'usr' });

const User = models.makeVersion(UserModel, {
  attributes: {
    name: primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});

const Account = models.makeVersion(
  models.makeModel({ name: 'account', abbreviation: 'acct' }),
  {
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
);

const ListModel = models.makeModel({ name: 'list', abbreviation: 'lst' });

const List = models.makeVersion(ListModel, {
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
});

const ItemModel = models.makeModel({ name: 'item', abbreviation: 'tsk' });

const Item = models.makeVersion(ItemModel, {
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
});

const ProductModel = models.makeModel({ name: 'product', abbreviation: 'prd' });

const Product = models.makeVersion(ProductModel, {
  attributes: {
    name: primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});

const ProductReplica = makeReplica({
  sourceModel: Product,
  modelVersion: Product.version,
  serviceName: 'app',
});

const StockModel = models.makeModel({ name: 'stock', abbreviation: 'stk' });

const Stock = models.makeVersion(StockModel, {
  attributes: {
    quantity: primitives.integer(),
  },
  indexes: [],
  version: '1.0.0',
});

const StockReplica = makeReplica({
  sourceModel: Stock,
  modelVersion: Stock.version,
  serviceName: 'inventory',
});

const Preference = models.makeVersion(
  models.makeModel({ name: 'preference', abbreviation: 'pref' }),
  {
    attributes: {
      settings: primitives.json({
        schema: Schema.Struct({ theme: Schema.String }),
      }),
    },
    indexes: [],
    version: '2.0.0',
  },
);

const CatalogSettings = models.makeVersion(
  models.makeModel({ name: 'catalogSettings', abbreviation: 'scfg' }),
  {
    attributes: {
      settings: primitives.json({
        schema: Schema.Struct({ currency: Schema.String }),
      }),
    },
    indexes: [],
    version: '1.0.0',
  },
);

const createUser = contracts.makeVersion(contracts.makeCommand('createUser'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: UserModel.abbreviation }),
    name: primitives.text(),
  },

  /*
   * Produces the createUser fixture mutations consumed by command execution tests.
   *
   * 1. Build the declared mutations.
   */
  models: { user: User },
  program: ({ payload, models }) =>
    // 1 — construct the fixture mutations from the supplied payload
    Effect.all({
      created: models.user.create({
        resourceId: payload.id,
        attributes: {
          name: payload.name,
        },
      }),
    }),
  version: '1.0.0',
});

export const createList = contracts.makeVersion(
  contracts.makeCommand('createList'),
  {
    /*
     * Exercises contract guard rejection before a fixture list mutation is accepted.
     *
     * 1. Reject the sentinel list name.
     */
    guard: ({ payload }: { payload: { name: string } }) =>
      Effect.gen(function* () {
        // 1 — return list-name-rejected for invalid-name and otherwise succeed
        if (payload.name === 'invalid-name') {
          return yield* new ZerospinError({
            code: 'list-name-rejected',
            message: `List name is rejected: ${payload.name}`,
          });
        }
      }).pipe(Effect.withSpan('createListGuard')),

    payload: {
      id: primitives.foreignKey({ abbreviation: ListModel.abbreviation }),
      name: primitives.text(),
      userId: primitives.foreignKey({ abbreviation: UserModel.abbreviation }),
    },

    /*
     * Produces the createList fixture mutations consumed by command execution tests.
     *
     * 1. Read command attributes.
     * 2. Build the declared mutations.
     */
    models: { list: List },
    program: ({ payload, models }) => {
      // 1 — extract the authored payload fields used by this mutation
      const { id, name, userId } = payload;

      // 2 — return model mutation Effects for the execution path to apply
      return Effect.all({
        created: models.list.create({
          resourceId: id,
          attributes: {
            name,
            userId,
          },
        }),
      });
    },
    version: '1.0.0',
  },
);

const createItem = contracts.makeVersion(contracts.makeCommand('createItem'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: ItemModel.abbreviation }),
    listId: primitives.foreignKey({ abbreviation: ListModel.abbreviation }),
    name: primitives.text(),
  },

  /*
   * Produces the createItem fixture mutations consumed by command execution tests.
   *
   * 1. Read command attributes.
   * 2. Build the declared mutations.
   */
  models: { item: Item },
  program: ({ payload, models }) => {
    // 1 — extract the authored payload fields used by this mutation
    const { id, listId, name } = payload;

    // 2 — return model mutation Effects for the execution path to apply
    return Effect.all({
      created: models.item.create({
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

export const updateList = contracts.makeVersion(
  contracts.makeCommand('updateList'),
  {
    /*
     * Exercises contract guard reads and delayed completion against fixture list state.
     *
     * 1. Read the requested list.
     * 2. Reject a missing list.
     * 3. Delay the stale-state scenario.
     */
    guard: ({
      db,
      payload,
    }: {
      db: Readonly<
        Pick<
          IDb<IResourceDbConfig<{ list: typeof List }, Record<never, never>>>,
          'query'
        >
      >;
      payload: { id: string; name: string };
    }) =>
      Effect.gen(function* () {
        // 1 — query by payload.id and encode query failures as fixture-list-query-failed
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

        // 2 — return list-not-found before attempting the command
        if (list === undefined) {
          return yield* new ZerospinError({
            code: 'list-not-found',
            message: `List ${payload.id} was not found`,
          });
        }

        // 3 — sleep for 500 milliseconds to let the test change state during guard evaluation
        if (payload.name === 'stale-at-commit') {
          yield* Effect.sleep('500 millis');
        }
      }).pipe(Effect.withSpan('updateListGuard')),

    payload: {
      id: primitives.foreignKey({ abbreviation: ListModel.abbreviation }),
      name: primitives.text(),
      userId: primitives.foreignKey({ abbreviation: UserModel.abbreviation }),
    },

    /*
     * Produces the updateList fixture mutations consumed by command execution tests.
     *
     * 1. Read command attributes.
     * 2. Build the declared mutations.
     */
    models: { list: List },
    program: ({ payload, models }) => {
      // 1 — extract the authored payload fields used by this mutation
      const { id, name, userId } = payload;

      // 2 — return model mutation Effects for the execution path to apply
      return Effect.all({
        updated: models.list.update({
          resourceId: id,
          attributes: { name, userId },
        }),
      });
    },
    version: '1.0.0',
  },
);

export const renameList = contracts.makeVersion(
  contracts.makeCommand('renameList'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: ListModel.abbreviation }),
      name: primitives.text(),
      userId: primitives.foreignKey({ abbreviation: UserModel.abbreviation }),
    },

    /*
     * Produces the renameList fixture mutations consumed by command execution tests.
     *
     * 1. Build the declared mutations.
     */
    models: { list: List },
    program: ({ payload, models }) =>
      // 1 — construct the fixture mutations from the supplied payload
      Effect.all({
        updated: models.list.update({
          resourceId: payload.id,
          attributes: { name: payload.name, userId: payload.userId },
        }),
      }),
    version: '1.1.0',
  },
);

const createProduct = contracts.makeVersion(
  contracts.makeCommand('createProduct'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: ProductModel.abbreviation }),
      name: primitives.text(),
    },

    /*
     * Produces the createProduct fixture mutations consumed by command execution tests.
     *
     * 1. Read command attributes.
     * 2. Build the declared mutations.
     */
    models: { product: Product },
    program: ({ payload, models }) => {
      // 1 — extract the authored payload fields used by this mutation
      const { id, name } = payload;

      // 2 — return model mutation Effects for the execution path to apply
      return Effect.all({
        created: models.product.create({
          resourceId: id,
          attributes: { name },
        }),
      });
    },
    version: '1.0.0',
  },
);

const updateProduct = contracts.makeVersion(
  contracts.makeCommand('updateProduct'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: ProductModel.abbreviation }),
      name: primitives.text(),
    },

    /*
     * Produces the updateProduct fixture mutations consumed by command execution tests.
     *
     * 1. Read command attributes.
     * 2. Build the declared mutations.
     */
    models: { product: Product },
    program: ({ payload, models }) => {
      // 1 — extract the authored payload fields used by this mutation
      const { id, name } = payload;

      // 2 — return model mutation Effects for the execution path to apply
      return Effect.all({
        updated: models.product.update({
          resourceId: id,
          attributes: { name },
        }),
      });
    },
    version: '1.1.0',
  },
);

const deleteProduct = contracts.makeVersion(
  contracts.makeCommand('deleteProduct'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: ProductModel.abbreviation }),
    },

    /*
     * Produces the deleteProduct fixture mutations consumed by command execution tests.
     *
     * 1. Build the declared mutations.
     */
    models: { product: Product },
    program: ({ payload, models }) =>
      // 1 — construct the fixture mutations from the supplied payload
      Effect.all({
        deleted: models.product.delete({
          resourceId: payload.id,
        }),
      }),
    version: '1.0.0',
  },
);

const replicateProduct = contracts.makeVersion(
  contracts.makeCommand('replicateProduct'),
  {
    payload: {
      product: primitives.json({ schema: Product.resourceSchema }),
    },

    /*
     * Produces the replicateProduct fixture mutations consumed by command execution tests.
     *
     * 1. Build the declared mutations.
     */
    models: { productReplica: ProductReplica },
    program: ({ payload, models }) =>
      // 1 — construct the fixture mutations from the supplied payload
      Effect.all({
        replicated: models.productReplica.replicate(payload.product),
      }),
    version: '1.0.0',
  },
);

const createListAndReplicateProduct = contracts.makeVersion(
  contracts.makeCommand('createListAndReplicateProduct'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: ListModel.abbreviation }),
      name: primitives.text(),
      userId: primitives.foreignKey({ abbreviation: UserModel.abbreviation }),
      product: primitives.json({ schema: Product.resourceSchema }),
    },

    /*
     * Produces the createListAndReplicateProduct fixture mutations consumed by command execution tests.
     *
     * 1. Build the declared mutations.
     */
    models: { list: List, productReplica: ProductReplica },
    program: ({ payload, models }) =>
      // 1 — construct the fixture mutations from the supplied payload
      Effect.all({
        created: models.list.create({
          resourceId: payload.id,
          attributes: {
            name: payload.name,
            userId: payload.userId,
          },
        }),
        replicated: models.productReplica.replicate(payload.product),
      }),
    version: '1.0.0',
  },
);

const createStock = contracts.makeVersion(
  contracts.makeCommand('createStock'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: StockModel.abbreviation }),
      quantity: primitives.integer(),
    },

    /*
     * Produces the createStock fixture mutations consumed by command execution tests.
     *
     * 1. Build the declared mutations.
     */
    models: { stock: Stock },
    program: ({ payload, models }) =>
      // 1 — construct the fixture mutations from the supplied payload
      Effect.all({
        created: models.stock.create({
          resourceId: payload.id,
          attributes: { quantity: payload.quantity },
        }),
      }),
    version: '1.0.0',
  },
);

const updateStock = contracts.makeVersion(
  contracts.makeCommand('updateStock'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: StockModel.abbreviation }),
      quantity: primitives.integer(),
    },

    /*
     * Produces the updateStock fixture mutations consumed by command execution tests.
     *
     * 1. Build the declared mutations.
     */
    models: { stock: Stock },
    program: ({ payload, models }) =>
      // 1 — construct the fixture mutations from the supplied payload
      Effect.all({
        updated: models.stock.update({
          resourceId: payload.id,
          attributes: { quantity: payload.quantity },
        }),
      }),
    version: '1.0.0',
  },
);

const replicateProductAndStock = contracts.makeVersion(
  contracts.makeCommand('replicateProductAndStock'),
  {
    payload: {
      product: primitives.json({ schema: Product.resourceSchema }),
      stock: primitives.json({ schema: Stock.resourceSchema }),
    },

    /*
     * Produces the replicateProductAndStock fixture mutations consumed by command execution tests.
     *
     * 1. Build the declared mutations.
     */
    models: { productReplica: ProductReplica, stockReplica: StockReplica },
    program: ({ payload, models }) =>
      // 1 — construct the fixture mutations from the supplied payload
      Effect.all({
        product: models.productReplica.replicate(payload.product),
        stock: models.stockReplica.replicate(payload.stock),
      }),
    version: '1.0.0',
  },
);

export const moveItem = contracts.makeVersion(
  contracts.makeCommand('moveItem'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: ItemModel.abbreviation }),
      prevListId: primitives.foreignKey({
        abbreviation: ListModel.abbreviation,
      }),
      nextListId: primitives.foreignKey({
        abbreviation: ListModel.abbreviation,
      }),
    },

    /*
     * Produces the moveItem fixture mutations consumed by command execution tests.
     *
     * 1. Read command attributes.
     * 2. Build the declared mutations.
     */
    models: { item: Item },
    program: ({ payload, models }) => {
      // 1 — extract the authored payload fields used by this mutation
      const { id, prevListId, nextListId } = payload;

      // 2 — return model mutation Effects for the execution path to apply
      return Effect.all({
        moved: models.item.move({
          resourceId: id,
          property: 'listId',
          prevId: prevListId,
          nextId: nextListId,
        }),
      });
    },
    version: '1.0.0',
  },
);

export const deleteList = contracts.makeVersion(
  contracts.makeCommand('deleteList'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: ListModel.abbreviation }),
    },

    /*
     * Produces the deleteList fixture mutations consumed by command execution tests.
     *
     * 1. Read command attributes.
     * 2. Build the declared mutations.
     */
    models: { list: List },
    program: ({ payload, models }) => {
      // 1 — extract the authored payload fields used by this mutation
      const { id } = payload;

      // 2 — return model mutation Effects for the execution path to apply
      return Effect.all({
        deleted: models.list.delete({
          resourceId: id,
        }),
      });
    },
    version: '1.0.0',
  },
);

export const authenticationSignature = {
  version: '1.0.0',
  signature: Schema.Struct({
    userId: makeModelIdSchema(User),
  }),
};

export const main = makeFrontendController({
  aggregateVersion: '1.0.0',
  contracts: {
    createList: {
      contract: createList,
    },
    createItem: { contract: createItem },
    createListAndReplicateProduct: {
      contract: createListAndReplicateProduct,
    },
    replicateProduct: { contract: replicateProduct },
    replicateProductAndStock: { contract: replicateProductAndStock },
    deleteList: { contract: deleteList },
    moveItem: { contract: moveItem },
    renameList: { contract: renameList },
    updateList: {
      contract: updateList,
    },
  },
  aggregateName: 'user',
  name: 'main',
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
});

export const mainModels = getFrontendDbModels(main);

const products = makeFrontendController({
  systemName: 'system-worker',
  serviceVersion: '1.0.0',
  serviceName: 'app',
  name: 'products',
  models: { catalogSettings: CatalogSettings, product: Product },
});

const app = makeService({
  name: 'app',
  version: '1.0.0',
  historicalDefinitions: [
    {
      version: '0.9.0',
      models: { catalogSettings: '1.0.0', product: '1.0.0' },
      contracts: {
        createProduct: '1.0.0',
        deleteProduct: '1.0.0',
        updateProduct: '1.1.0',
      },
    },
  ],
  /*
   * Exercises service frontend authorization against the products table.
   *
   * 1. Read the supplied query capability.
   * 2. Exercise the products read.
   */
  authorize: (props: {
    frontendName: 'products';
    userId: string;
    db: Readonly<
      Pick<
        IDb<
          IResourceDbConfig<{ product: typeof Product }, Record<never, never>>
        >,
        'query'
      >
    >;
  }) => {
    // 1 — use the service database from the authorization context
    const { db } = props;

    // 2 — discard query results and map database failure to the fixture authorization error
    return Effect.try({
      try: () => db.query.product.findMany().sync(),
      catch: cause =>
        new ZerospinError({
          code: 'fixture-products-authorization-query-failed',
          message: 'Failed to query products during authorization.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    }).pipe(Effect.asVoid);
  },
  models: { catalogSettings: CatalogSettings, product: Product },
  contracts: { createProduct, deleteProduct, updateProduct },
  queries: {
    getProducts: {
      paramsSchema: Schema.Struct({}),
      /*
       * Provides the fixture product query exposed through the service.
       *
       * 1. Read product identifiers and names.
       */
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
        // 1 — project id and name and map query failure to fixture-products-query-failed
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
});
const inventory = makeService({
  name: 'inventory',
  version: '1.0.0',
  models: { stock: Stock },
  contracts: { createStock, updateStock },
  queries: {},
  frontends: {},
});

export const system = makeSystem({
  authentication: [
    authentication.makeVersion({
      version: authenticationSignature.version,
      signature: authenticationSignature.signature,
      authenticate: ({ signature }) =>
        // 1 — pass signature.userId into the authentication result
        Effect.succeed(signature.userId),
    }),
  ],
  aggregates: {
    notes: ['0.8.0', '0.9.0', '1.0.0'].map(version =>
      aggregates.makeVersion(aggregates.makeAggregate({ name: 'notes' }), {
        version,
        services: {},
        models: { user: User, preference: Preference },
        contracts: { createUser: { contract: createUser } },
        selections: {
          user: makeSelection({ model: User, where: () => ({}) }),
          preference: makeSelection({ model: Preference, where: () => ({}) }),
        },
      }),
    ),
    user: [
      aggregates.makeVersion(aggregates.makeAggregate({ name: 'user' }), {
        services: { app, inventory },

        version: '1.0.0',
        /*
         * Authorizes the fixture aggregate frontend by checking that the supplied user exists.
         *
         * 1. Read the supplied authorization context.
         * 2. Decode the user model identifier.
         * 3. Read the fixture user.
         * 4. Reject a missing user.
         * 5. Accept the existing user.
         */
        authorize: (props: {
          userId: string;
          aggregateId: IAggregateId;
          db: Readonly<
            Pick<
              IDb<IResourceDbConfig<typeof mainModels, Record<never, never>>>,
              'query'
            >
          >;
        }) => {
          // 1 — take the database and requested userId from the caller context
          const { db, userId: requestedUserId } = props;
          return Effect.gen(function* () {
            // 2 — map invalid user ids to fixture-user-id-invalid
            const userId = yield* Schema.decodeUnknownEffect(
              makeModelIdSchema(User),
            )(requestedUserId).pipe(
              mapParseError({
                code: 'fixture-user-id-invalid',
                prefix: 'Failed to decode the fixture authorization userId',
              }),
            );

            // 3 — query by the decoded id and map database failures
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

            // 4 — return user-not-found before authorization succeeds
            if (user === undefined) {
              return yield* new ZerospinError({
                code: 'user-not-found',
                message: `User ${requestedUserId} was not found`,
              });
            }

            // 5 — complete authorization after the user lookup succeeds
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
          createUser: { contract: createUser },
          createList: {
            contract: createList,
            /*
             * Exercises aggregate guard rejection and direct-command user provenance.
             *
             * 1. Reject the aggregate sentinel name.
             * 2. Report direct-command provenance.
             */
            guard: ({
              payload,
              userId,
            }: {
              payload: InferCommand<typeof createList>['payload'];
              userId: string | null;
            }) =>
              Effect.gen(function* () {
                // 1 — return aggregate-list-name-rejected from the aggregate guard
                if (payload.name === 'invalid-aggregate-name') {
                  return yield* new ZerospinError({
                    code: 'aggregate-list-name-rejected',
                    message: `Aggregate rejected list name: ${payload.name}`,
                  });
                }

                // 2 — distinguish null userId from unexpected non-null provenance through the failure code
                if (payload.name === 'direct-null-provenance') {
                  if (userId === null) {
                    return yield* new ZerospinError({
                      code: 'direct-null-user-id-observed',
                      message:
                        'Aggregate guard observed direct-command userId null.',
                    });
                  }
                  return yield* new ZerospinError({
                    code: 'direct-user-id-was-not-null',
                    message: `Direct aggregate guard received userId ${userId}.`,
                  });
                }
              }).pipe(Effect.withSpan('aggregateCreateListGuard')),
          },
          createItem: { contract: createItem },
          createListAndReplicateProduct: {
            contract: createListAndReplicateProduct,
          },
          replicateProduct: {
            contract: replicateProduct,
            guard: ({
              db,
              payload,
            }: {
              db: Readonly<
                Pick<
                  IDb<
                    IResourceDbConfig<
                      { product: typeof ProductReplica },
                      Record<never, never>
                    >
                  >,
                  'query'
                >
              >;
              payload: InferCommand<typeof replicateProduct>['payload'];
            }) =>
              Effect.gen(function* () {
                if (!payload.product.name.startsWith('guard-')) return;
                const replica = db.query.product
                  .findFirst({ where: { id: payload.product.id } })
                  .sync();
                if (replica?.name !== 'Authoritative product') {
                  return yield* new ZerospinError({
                    code: 'replica-observation-rejected',
                    message:
                      'Guard did not observe an available authoritative initial copy',
                  });
                }
                if (payload.product.name === 'guard-reject-after-copy') {
                  return yield* new ZerospinError({
                    code: 'replica-guard-rejected',
                    message:
                      'Guard rejected after observing the initialized replica',
                  });
                }
              }),
          },
          replicateProductAndStock: { contract: replicateProductAndStock },
          deleteList: { contract: deleteList },
          moveItem: { contract: moveItem },
          renameList: { contract: renameList },
          updateList: { contract: updateList },
        },
        selections: {
          user: makeSelection({
            model: User,
            /*
             * Defines the User fixture selection used when constructing aggregate state.
             *
             * 1. Build the selection predicate.
             */
            where: ({ userId }) =>
              // 1 — scope the selected model through its user relationship
              ({ id: userId }),
          }),
          list: makeSelection({
            model: List,
            /*
             * Defines the List fixture selection used when constructing aggregate state.
             *
             * 1. Build the selection predicate.
             */
            where: ({ userId }) =>
              // 1 — scope the selected model through its user relationship
              ({
                user: { id: userId },
              }),
          }),
          item: makeSelection({
            model: Item,
            /*
             * Defines the Item fixture selection used when constructing aggregate state.
             *
             * 1. Build the selection predicate.
             */
            where: ({ userId }) =>
              // 1 — scope the selected model through its user relationship
              ({
                list: { user: { id: userId } },
              }),
          }),
          account: makeSelection({
            model: Account,
            /*
             * Defines the Account fixture selection used when constructing aggregate state.
             *
             * 1. Build the selection predicate.
             */
            where: () =>
              // 1 — select all rows of this fixture model
              ({}),
          }),
          preference: makeSelection({
            model: Preference,
            /*
             * Defines the Preference fixture selection used when constructing aggregate state.
             *
             * 1. Build the selection predicate.
             */
            where: () =>
              // 1 — select all rows of this fixture model
              ({}),
          }),
          product: makeSelection({
            model: ProductReplica,
            /*
             * Defines the ProductReplica fixture selection used when constructing aggregate state.
             *
             * 1. Build the selection predicate.
             */
            where: () =>
              // 1 — select all rows of this fixture model
              ({}),
          }),
          stock: makeSelection({
            model: StockReplica,
            /*
             * Defines the StockReplica fixture selection used when constructing aggregate state.
             *
             * 1. Build the selection predicate.
             */
            where: () =>
              // 1 — select all rows of this fixture model
              ({}),
          }),
        },
      }),
    ],
  },
  services: { app: [app], inventory: [inventory] },
  name: 'system-worker',
});

export const config = system.config();
