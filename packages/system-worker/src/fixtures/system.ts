import { RoutePattern } from '@remix-run/route-pattern';
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/make/makeAggregateVersion';
import { defineAggregateActor } from '@zerospin/core/aggregateActor/defineAggregateActor';
import { makeAggregateActorVersion } from '@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
/*
 * System-worker annotation:
 * Builds fixture data for system-worker tests and examples.
 * Fixture changes should preserve the domain relationships that repo and API tests rely on.
 */
import { makeAggregateSessionDefinition } from '@zerospin/core/aggregateSession/make/makeAggregateSessionDefinition';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
/*
 * System-worker annotation:
 * Builds fixture data for system-worker tests and examples.
 * Fixture changes should preserve the domain relationships that repo and API tests rely on.
 */
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import { makeModelIdSchema } from '@zerospin/core/models/make/makeModelIdSchema';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { makeReplica } from '@zerospin/core/models/make/makeReplica';
import type { IAggregateId } from '@zerospin/core/models/types';
import { makeService } from '@zerospin/core/service/make/makeService';
import { defineServiceActor } from '@zerospin/core/serviceActor/defineServiceActor';
import { makeServiceActorVersion } from '@zerospin/core/serviceActor/make/makeServiceActorVersion';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemConfig } from '@zerospin/core/system/make/makeSystemConfig';
import {
  ContractError,
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
} from '@zerospin/error';
import { Carrier } from '@zerospin/fulfillment/server';
import { PaymentProvider, PromotionProvider } from '@zerospin/purchase/server';
import { primitives } from '@zerospin/schema';
import { Effect, Layer, Schema } from 'effect';

import {
  AutomationDecision,
  automationGame,
} from '../workerd-utils/automationFixture.js';
import { serviceAutomation } from '../workerd-utils/serviceAutomation.js';

import { admissionAggregate, admissionService } from './admission.js';
import { fulfillmentService } from './fulfillmentService.js';
import { purchaseAggregate } from './purchaseAggregate.js';
import { purchaseFulfillmentClient } from './purchaseFulfillmentClient.js';
import { productSource as purchaseProduct } from './purchaseModels.js';

const userModel = defineModel({ name: 'user', abbreviation: 'usr' });

const userVersion = makeModelVersion(userModel, {
  attributes: {
    name: primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});

const account = makeModelVersion(
  defineModel({ name: 'account', abbreviation: 'acct' }),
  {
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
);

const listModel = defineModel({ name: 'list', abbreviation: 'lst' });

const list = makeModelVersion(listModel, {
  attributes: {
    name: primitives.text(),
    userId: primitives.ref({
      table: userVersion.table,
      relation: 'user',
      inverse: 'lists',
    }),
  },
  indexes: [],
  version: '1.0.0',
});

const itemModel = defineModel({ name: 'item', abbreviation: 'tsk' });

const item = makeModelVersion(itemModel, {
  attributes: {
    listId: primitives.ref({
      table: list.table,
      relation: 'list',
      inverse: 'items',
    }),
    name: primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});

const productModel = defineModel({ name: 'product', abbreviation: 'prd' });

const product = makeModelVersion(productModel, {
  attributes: {
    name: primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});

const productReplica = makeReplica({
  sourceModel: product,
  serviceVersion: '1.0.0',
  serviceName: 'app',
});

const stockModel = defineModel({ name: 'stock', abbreviation: 'stk' });

const stock = makeModelVersion(stockModel, {
  attributes: {
    quantity: primitives.integer(),
  },
  indexes: [],
  version: '1.0.0',
});

const stockReplica = makeReplica({
  sourceModel: stock,
  serviceVersion: '1.0.0',
  serviceName: 'inventory',
});

const preference = makeModelVersion(
  defineModel({ name: 'preference', abbreviation: 'pref' }),
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

const catalogSettings = makeModelVersion(
  defineModel({ name: 'catalogSettings', abbreviation: 'scfg' }),
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

const createUser = makeContractVersion(defineContract('createUser'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: userModel.abbreviation }),
    name: primitives.text(),
  },

  /*
   * Produces the createUser fixture mutations consumed by command execution tests.
   *
   * 1. Build the declared mutations.
   */
  models: { user: userVersion },
  program: ({ payload, models }) =>
    // 1 — construct the fixture mutations from the supplied payload
    Effect.all([
      models.user.create({
        resourceId: payload.id,
        attributes: {
          name: payload.name,
        },
      }),
    ]),
  version: '1.0.0',
});

export const createList = makeContractVersion(defineContract('createList'), {
  guard: ({ failures, payload }: { payload: { name: string } }) =>
    Effect.gen(function* () {
      // 1 — return list-name-rejected for invalid-name and otherwise succeed
      if (payload.name === 'invalid-name') {
        return yield* Effect.fail(
          failures.listNameRejected.make({
            extra: null,
            message: `List name is rejected: ${payload.name}`,
          }),
        );
      }
    }).pipe(Effect.withSpan('createListGuard')),
  failures: {
    listNameRejected: ContractError.schema({ code: 'list-name-rejected' }),
    programListNameRejected: ContractError.schema({
      code: 'aggregate-list-name-rejected',
    }),
  },
  /*
   * Exercises contract guard rejection before a fixture list mutation is accepted.
   *
   * 1. Reject the sentinel list name.
   */

  payload: {
    id: primitives.foreignKey({ abbreviation: listModel.abbreviation }),
    name: primitives.text(),
    userId: primitives.foreignKey({ abbreviation: userModel.abbreviation }),
  },

  /*
   * Produces the createList fixture mutations consumed by command execution tests.
   *
   * 1. Read command attributes.
   * 2. Build the declared mutations.
   */
  models: { list },
  program: ({ failures, payload, models, identity }) =>
    Effect.gen(function* () {
      // 1 — return aggregate-list-name-rejected from the aggregate guard
      if (payload.name === 'invalid-aggregate-name') {
        return yield* failures.programListNameRejected.make({
          extra: null,
          message: `Aggregate rejected list name: ${payload.name}`,
        });
      }

      // 2 — distinguish null identity from unexpected non-null provenance through the failure code
      if (payload.name === 'direct-null-provenance') {
        if (identity === null) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'direct-null-identity-observed',
              message: 'Aggregate guard observed direct-command identity null.',
            }),
          );
        }
        return yield* Effect.fail(
          makeZerospinError({
            code: 'direct-identity-was-not-null',
            message: `Direct aggregate guard received identity ${identity}.`,
          }),
        );
      }

      // 1 — extract the authored payload fields used by this mutation
      const { id, name, userId } = payload;

      // 2 — return model mutation Effects for the execution path to apply
      return yield* Effect.all([
        models.list.create({
          resourceId: id,
          attributes: {
            name,
            userId,
          },
        }),
      ]);
    }),
  version: '1.0.0',
});

const createItem = makeContractVersion(defineContract('createItem'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: itemModel.abbreviation }),
    listId: primitives.foreignKey({ abbreviation: listModel.abbreviation }),
    name: primitives.text(),
  },

  /*
   * Produces the createItem fixture mutations consumed by command execution tests.
   *
   * 1. Read command attributes.
   * 2. Build the declared mutations.
   */
  models: { item },
  program: ({ payload, models }) => {
    // 1 — extract the authored payload fields used by this mutation
    const { id, listId, name } = payload;

    // 2 — return model mutation Effects for the execution path to apply
    return Effect.all([
      models.item.create({
        resourceId: id,
        attributes: {
          listId,
          name,
        },
      }),
    ]);
  },
  version: '1.0.0',
});

export const updateList = makeContractVersion(defineContract('updateList'), {
  guard: ({ payload, queryDb }) =>
    Effect.gen(function* () {
      // 1 — query by payload.id and encode query failures as fixture-list-query-failed
      const list = yield* Effect.try({
        try: () =>
          queryDb.query.list
            .findFirst({
              where: { id: { eq: payload.id } },
            })
            .sync(),
        catch: cause =>
          makeZerospinError({
            code: 'fixture-list-query-failed',
            message: `Failed to query list ${payload.id} during guard evaluation.`,
            cause: prettyUnknownFailure(cause),
          }),
      });

      // 2 — return list-not-found before attempting the command
      if (list === undefined) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'list-not-found',
            message: `List ${payload.id} was not found`,
          }),
        );
      }
    }),
  /*
   * Exercises contract guard reads and delayed completion against fixture list state.
   *
   * 1. Read the requested list.
   * 2. Reject a missing list.
   * 3. Delay the stale-state scenario.
   */

  payload: {
    id: primitives.foreignKey({ abbreviation: listModel.abbreviation }),
    name: primitives.text(),
    userId: primitives.foreignKey({ abbreviation: userModel.abbreviation }),
  },

  /*
   * Produces the updateList fixture mutations consumed by command execution tests.
   *
   * 1. Read command attributes.
   * 2. Build the declared mutations.
   */
  models: { list },
  program: ({ payload, models }) =>
    Effect.gen(function* () {
      // 1 — extract the authored payload fields used by this mutation
      const { id, name, userId } = payload;

      // 2 — return model mutation Effects for the execution path to apply
      return yield* Effect.all([
        models.list.update({
          resourceId: id,
          attributes: { name, userId },
        }),
      ]);
    }),
  version: '1.0.0',
});

export const renameList = makeContractVersion(defineContract('renameList'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: listModel.abbreviation }),
    name: primitives.text(),
    userId: primitives.foreignKey({ abbreviation: userModel.abbreviation }),
  },

  /*
   * Produces the renameList fixture mutations consumed by command execution tests.
   *
   * 1. Build the declared mutations.
   */
  models: { list },
  program: ({ payload, models }) =>
    // 1 — construct the fixture mutations from the supplied payload
    Effect.all([
      models.list.update({
        resourceId: payload.id,
        attributes: { name: payload.name, userId: payload.userId },
      }),
    ]),
  version: '1.1.0',
});

const createProduct = makeContractVersion(defineContract('createProduct'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: productModel.abbreviation }),
    name: primitives.text(),
  },

  /*
   * Produces the createProduct fixture mutations consumed by command execution tests.
   *
   * 1. Read command attributes.
   * 2. Build the declared mutations.
   */
  models: { product },
  program: ({ payload, models }) => {
    // 1 — extract the authored payload fields used by this mutation
    const { id, name } = payload;

    // 2 — return model mutation Effects for the execution path to apply
    return Effect.all([
      models.product.create({
        resourceId: id,
        attributes: { name },
      }),
    ]);
  },
  version: '1.0.0',
});

const updateProduct = makeContractVersion(defineContract('updateProduct'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: productModel.abbreviation }),
    name: primitives.text(),
  },

  /*
   * Produces the updateProduct fixture mutations consumed by command execution tests.
   *
   * 1. Read command attributes.
   * 2. Build the declared mutations.
   */
  models: { product },
  program: ({ payload, models }) => {
    // 1 — extract the authored payload fields used by this mutation
    const { id, name } = payload;

    // 2 — return model mutation Effects for the execution path to apply
    return Effect.all([
      models.product.update({
        resourceId: id,
        attributes: { name },
      }),
    ]);
  },
  version: '1.1.0',
});

const deleteProduct = makeContractVersion(defineContract('deleteProduct'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: productModel.abbreviation }),
  },

  /*
   * Produces the deleteProduct fixture mutations consumed by command execution tests.
   *
   * 1. Build the declared mutations.
   */
  models: { product },
  program: ({ payload, models }) =>
    // 1 — construct the fixture mutations from the supplied payload
    Effect.all([
      models.product.delete({
        resourceId: payload.id,
      }),
    ]),
  version: '1.0.0',
});

const replicateProduct = makeContractVersion(
  defineContract('replicateProduct'),
  {
    failures: {
      replicaObservationRejected: ContractError.schema({
        code: 'replica-observation-rejected',
      }),
      replicaGuardRejected: ContractError.schema({
        code: 'replica-guard-rejected',
      }),
    },
    guard: ({ failures, payload, queryDb }) =>
      Effect.gen(function* () {
        if (payload.product.name.startsWith('guard-')) {
          const replica = queryDb.query.product
            .findFirst({ where: { id: payload.product.id } })
            .sync();
          if (
            replica !== undefined &&
            replica.name !== 'Authoritative product'
          ) {
            return yield* Effect.fail(
              failures.replicaObservationRejected.make({
                extra: null,
                message: 'Guard rejected the current replica state',
              }),
            );
          }
          if (payload.product.name === 'guard-reject-after-copy') {
            return yield* Effect.fail(
              failures.replicaGuardRejected.make({
                extra: null,
                message:
                  'Guard rejected after observing the initialized replica',
              }),
            );
          }
        }
      }),
    payload: {
      product: primitives.json({ schema: product.resourceSchema }),
    },

    /*
     * Produces the replicateProduct fixture mutations consumed by command execution tests.
     *
     * 1. Build the declared mutations.
     */
    models: { productReplica },
    program: ({ payload, models }) =>
      Effect.gen(function* () {
        return yield* Effect.all([
          models.productReplica.replicate(payload.product),
        ]);
      }),
    version: '1.0.0',
  },
);

const createListAndReplicateProduct = makeContractVersion(
  defineContract('createListAndReplicateProduct'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: listModel.abbreviation }),
      name: primitives.text(),
      userId: primitives.foreignKey({ abbreviation: userModel.abbreviation }),
      product: primitives.json({ schema: product.resourceSchema }),
    },

    /*
     * Produces the createListAndReplicateProduct fixture mutations consumed by command execution tests.
     *
     * 1. Build the declared mutations.
     */
    models: { list, productReplica },
    program: ({ payload, models }) =>
      // 1 — construct the fixture mutations from the supplied payload
      Effect.all([
        models.list.create({
          resourceId: payload.id,
          attributes: {
            name: payload.name,
            userId: payload.userId,
          },
        }),
        models.productReplica.replicate(payload.product),
      ]),
    version: '1.0.0',
  },
);

const createStock = makeContractVersion(defineContract('createStock'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: stockModel.abbreviation }),
    quantity: primitives.integer(),
  },

  /*
   * Produces the createStock fixture mutations consumed by command execution tests.
   *
   * 1. Build the declared mutations.
   */
  models: { stock },
  program: ({ payload, models }) =>
    // 1 — construct the fixture mutations from the supplied payload
    Effect.all([
      models.stock.create({
        resourceId: payload.id,
        attributes: { quantity: payload.quantity },
      }),
    ]),
  version: '1.0.0',
});

const updateStock = makeContractVersion(defineContract('updateStock'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: stockModel.abbreviation }),
    quantity: primitives.integer(),
  },

  /*
   * Produces the updateStock fixture mutations consumed by command execution tests.
   *
   * 1. Build the declared mutations.
   */
  models: { stock },
  program: ({ payload, models }) =>
    // 1 — construct the fixture mutations from the supplied payload
    Effect.all([
      models.stock.update({
        resourceId: payload.id,
        attributes: { quantity: payload.quantity },
      }),
    ]),
  version: '1.0.0',
});

const replicateProductAndStock = makeContractVersion(
  defineContract('replicateProductAndStock'),
  {
    payload: {
      product: primitives.json({ schema: product.resourceSchema }),
      stock: primitives.json({ schema: stock.resourceSchema }),
    },

    /*
     * Produces the replicateProductAndStock fixture mutations consumed by command execution tests.
     *
     * 1. Build the declared mutations.
     */
    models: { productReplica, stockReplica },
    program: ({ payload, models }) =>
      // 1 — construct the fixture mutations from the supplied payload
      Effect.all([
        models.productReplica.replicate(payload.product),
        models.stockReplica.replicate(payload.stock),
      ]),
    version: '1.0.0',
  },
);

export const moveItem = makeContractVersion(defineContract('moveItem'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: itemModel.abbreviation }),
    prevListId: primitives.foreignKey({
      abbreviation: listModel.abbreviation,
    }),
    nextListId: primitives.foreignKey({
      abbreviation: listModel.abbreviation,
    }),
  },

  /*
   * Produces the moveItem fixture mutations consumed by command execution tests.
   *
   * 1. Read command attributes.
   * 2. Build the declared mutations.
   */
  models: { item },
  program: ({ payload, models }) => {
    // 1 — extract the authored payload fields used by this mutation
    const { id, prevListId, nextListId } = payload;

    // 2 — return model mutation Effects for the execution path to apply
    return Effect.all([
      models.item.move({
        resourceId: id,
        property: 'listId',
        prevId: prevListId,
        nextId: nextListId,
      }),
    ]);
  },
  version: '1.0.0',
});

export const deleteList = makeContractVersion(defineContract('deleteList'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: listModel.abbreviation }),
  },

  /*
   * Produces the deleteList fixture mutations consumed by command execution tests.
   *
   * 1. Read command attributes.
   * 2. Build the declared mutations.
   */
  models: { list },
  program: ({ payload, models }) => {
    // 1 — extract the authored payload fields used by this mutation
    const { id } = payload;

    // 2 — return model mutation Effects for the execution path to apply
    return Effect.all([
      models.list.delete({
        resourceId: id,
      }),
    ]);
  },
  version: '1.0.0',
});

export const main = {
  ...makeAggregateSessionDefinition({
    actorName: 'default',
    actorVersion: '1.0.0',
    identitySchema: Schema.Struct({
      aggregateId: Schema.String,
      userId: Schema.String,
    }),
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
    sessionName: 'main',
    models: {
      account,
      list,
      item,
      product: productReplica,
      preference,
      stock: stockReplica,
      user: userVersion,
    },
  }),
  systemName: 'system-worker',
};

export const mainModels = main.models;

export const products = {
  ...makeServiceSessionDefinition({
    actorName: 'default',
    actorVersion: '1.0.0',
    identitySchema: Schema.Struct({ userId: Schema.String }),
    serviceVersion: '1.0.0',
    serviceName: 'app',
    sessionName: 'products',
    models: { catalogSettings, product },
  }),
  systemName: 'system-worker',
};

const actorDb1 = makeActorDbVersion({
  models: { catalogSettings, product },
});
const actorIdentity1 = makeActorIdentity({
  schema: Schema.Struct({ userId: Schema.String }),
  actorPath: RoutePattern.parse('/:userId'),
});
const app = makeService({
  actors: {
    '1.0.0': {
      default: makeServiceActorVersion(
        defineServiceActor({ name: 'default' }),
        {
          authentication: 'none',
          version: '1.0.0',
          authorize: (props: {
            sessionName: string;
            identity: Readonly<Record<string, unknown>>;
            db: Readonly<
              Pick<
                IDb<
                  IResourceDbConfig<
                    { product: typeof product },
                    Record<never, never>
                  >
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
                makeZerospinError({
                  code: 'fixture-products-authorization-query-failed',
                  message: 'Failed to query products during authorization.',
                  cause: prettyUnknownFailure(cause),
                }),
            }).pipe(Effect.asVoid);
          },
          db: actorDb1,
          identity: actorIdentity1,
          queries: {
            catalogSettings: actorDb1.query['catalogSettings'].findMany({}),
            product: actorDb1.query['product'].findMany({}),
          },
        },
      ),
    },
  },

  name: 'app',
  /*
   * Exercises service definition authorization against the products table.
   *
   * 1. Read the supplied query capability.
   * 2. Exercise the products read.
   */

  module: {
    '1.0.0': {
      models: { catalogSettings, product },
      contracts: { createProduct, deleteProduct, updateProduct },
      automations: {},
    },
  },
  queries: {
    '1.0.0': {
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
                  { product: typeof product },
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
              makeZerospinError({
                code: 'fixture-products-query-failed',
                message: 'Failed to query fixture products.',
                cause: prettyUnknownFailure(cause),
              }),
          });
        }),
      },
    },
  },
});
const actorDb2 = makeActorDbVersion({ models: { stock } });
const actorIdentity2 = makeActorIdentity({
  schema: Schema.Struct({ userId: Schema.String }),
  actorPath: RoutePattern.parse('/:userId'),
});
const inventory = makeService({
  actors: {
    '1.0.0': {
      default: makeServiceActorVersion(
        defineServiceActor({ name: 'default' }),
        {
          authentication: 'none',
          version: '1.0.0',
          db: actorDb2,
          identity: actorIdentity2,
          queries: { stock: actorDb2.query['stock'].findMany({}) },
        },
      ),
    },
  },

  name: 'inventory',
  module: {
    '1.0.0': {
      models: { stock },
      contracts: { createStock, updateStock },
      automations: {},
    },
  },
});

const actorDb3 = makeActorDbVersion({
  models: { user: userVersion, preference },
});
const actorIdentity3 = makeActorIdentity({
  schema: Schema.Struct({
    aggregateId: Schema.String,
    userId: Schema.String,
  }),
  actorPath: RoutePattern.parse('/:userId'),
});
const notesSelection = makeAggregateActorVersion(
  defineAggregateActor({ name: 'default' }),
  {
    authentication: 'none',
    version: '1.0.0',
    contracts: { createUser },
    db: actorDb3,
    identity: actorIdentity3,
    queries: {
      user: actorDb3.query['user'].findMany({}),
      preference: actorDb3.query['preference'].findMany({}),
    },
  },
);

const actorDb5 = makeActorDbVersion({
  models: {
    user: userVersion,
    list,
    item,
    account,
    preference,
    product: productReplica,
    stock: stockReplica,
  },
});
const actorIdentity5 = makeActorIdentity({
  schema: Schema.Struct({
    aggregateId: Schema.String,
    userId: Schema.String,
  }),
  actorPath: RoutePattern.parse('/:userId'),
});
const actorDb6 = makeActorDbVersion({
  models: {
    product: productReplica,
    stock: stockReplica,
    user: userVersion,
    list,
    item,
  },
});
const actorIdentity6 = makeActorIdentity({
  schema: Schema.Struct({
    aggregateId: Schema.String,
    userId: Schema.String,
    role: Schema.String,
  }),
  actorPath: RoutePattern.parse('/:userId/:role'),
});
export const system = makeSystem({
  layer: Layer.mergeAll(
    Layer.succeed(AutomationDecision, value =>
      Effect.succeed(value === 13 ? 99 : value),
    ),
    Layer.succeed(Carrier, fulfillment =>
      Effect.succeed(`tracking-${fulfillment.id}`),
    ),
    purchaseFulfillmentClient,
    Layer.succeed(PaymentProvider, request =>
      Effect.succeed({
        outcome: 'succeeded' as const,
        providerReference: `fixture_${request.paymentIntentId}`,
      }),
    ),
    Layer.succeed(PromotionProvider, () =>
      Effect.die('Promotions are tested in the purchase package'),
    ),
  ),
  aggregates: {
    purchaseUser: { '1.0.0': purchaseAggregate },
    admission: { '1.0.0': admissionAggregate },
    automationGame: { '1.0.0': automationGame },
    notes: {
      '0.8.0': makeAggregateVersion(defineAggregate({ name: 'notes' }), {
        version: '0.8.0',
        models: { user: userVersion, preference },
        contracts: { createUser },
        automations: {},
        actors: {
          default: notesSelection,
        },
      }),
      '0.9.0': makeAggregateVersion(defineAggregate({ name: 'notes' }), {
        version: '0.9.0',
        models: { user: userVersion, preference },
        contracts: { createUser },
        automations: {},
        actors: {
          default: notesSelection,
        },
      }),
      '1.0.0': makeAggregateVersion(defineAggregate({ name: 'notes' }), {
        version: '1.0.0',
        models: { user: userVersion, preference },
        contracts: { createUser },
        automations: {},
        actors: {
          default: notesSelection,
        },
      }),
    },
    user: {
      '1.0.0': makeAggregateVersion(defineAggregate({ name: 'user' }), {
        version: '1.0.0',
        /*
         * Authorizes the fixture aggregate definition by checking that the supplied user exists.
         *
         * 1. Read the supplied authorization context.
         * 2. Decode the user model identifier.
         * 3. Read the fixture user.
         * 4. Reject a missing user.
         * 5. Accept the existing user.
         */

        models: {
          user: userVersion,
          list,
          item,
          account,
          preference,
          product: productReplica,
          stock: stockReplica,
        },
        contracts: {
          createUser,
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
        automations: {},

        actors: {
          role: makeAggregateActorVersion(
            defineAggregateActor({ name: 'role' }),
            {
              authentication: 'none',
              contracts: {
                createUser,
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
              version: '1.0.0',
              db: actorDb6,
              identity: actorIdentity6,
              queries: {
                product: actorDb6.query['product'].findMany({}),
                stock: actorDb6.query['stock'].findMany({}),
                user: actorDb6.query['user'].findMany({
                  where: {
                    OR: [
                      {
                        RAW: (_table, { eq }) =>
                          eq(
                            actorIdentity6.sql.placeholder('role'),
                            'operator',
                          ),
                      },
                      {
                        AND: [
                          {
                            id: {
                              eq: actorIdentity6.sql.placeholder('userId'),
                            },
                          },
                          { lists: {} },
                        ],
                      },
                    ],
                  },
                }),
                list: actorDb6.query['list'].findMany({
                  where: {
                    OR: [
                      {
                        RAW: (_table, { eq }) =>
                          eq(
                            actorIdentity6.sql.placeholder('role'),
                            'operator',
                          ),
                      },
                      {
                        user: {
                          id: {
                            eq: actorIdentity6.sql.placeholder('userId'),
                          },
                        },
                      },
                    ],
                  },
                }),
                item: actorDb6.query['item'].findMany({
                  where: {
                    OR: [
                      {
                        RAW: (_table, { eq }) =>
                          eq(
                            actorIdentity6.sql.placeholder('role'),
                            'operator',
                          ),
                      },
                      {
                        list: {
                          user: {
                            id: {
                              eq: actorIdentity6.sql.placeholder('userId'),
                            },
                          },
                        },
                      },
                    ],
                  },
                }),
              },
            },
          ),

          default: makeAggregateActorVersion(
            defineAggregateActor({ name: 'default' }),
            {
              authentication: 'none',
              contracts: {
                createUser,
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
              version: '1.0.0',
              authorize: (props: {
                identity: Readonly<Record<string, unknown>>;
                aggregateId: IAggregateId;
                db: Readonly<
                  Pick<
                    IDb<
                      IResourceDbConfig<typeof mainModels, Record<never, never>>
                    >,
                    'query'
                  >
                >;
              }) => {
                // 1 — take the database and requested identity from the caller context
                const { db, identity } = props;
                const requestedIdentityKey = identity.userId;
                return Effect.gen(function* () {
                  // 2 — map invalid user ids to fixture-user-id-invalid
                  const userId = yield* Schema.decodeUnknownEffect(
                    makeModelIdSchema(userVersion),
                  )(requestedIdentityKey).pipe(
                    mapParseError({
                      code: 'fixture-user-id-invalid',
                      prefix:
                        'Failed to decode the fixture authorization userId',
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
                      makeZerospinError({
                        code: 'fixture-user-query-failed',
                        message:
                          'Failed to query the fixture user during identity.',
                        cause: prettyUnknownFailure(cause),
                      }),
                  });

                  // 4 — return user-not-found before authorization succeeds
                  if (user === undefined) {
                    return yield* Effect.fail(
                      makeZerospinError({
                        code: 'user-not-found',
                        message: `User ${requestedIdentityKey} was not found`,
                      }),
                    );
                  }

                  // 5 — complete authorization after the user lookup succeeds
                  return yield* Effect.void;
                });
              },
              db: actorDb5,
              identity: actorIdentity5,
              queries: {
                user: actorDb5.query['user'].findMany({
                  where: {
                    id: { eq: actorIdentity5.sql.placeholder('userId') },
                  },
                }),
                list: actorDb5.query['list'].findMany({
                  where: {
                    user: {
                      id: {
                        eq: actorIdentity5.sql.placeholder('userId'),
                      },
                    },
                  },
                }),
                item: actorDb5.query['item'].findMany({
                  where: {
                    list: {
                      user: {
                        id: {
                          eq: actorIdentity5.sql.placeholder('userId'),
                        },
                      },
                    },
                  },
                }),
                account: actorDb5.query['account'].findMany({}),
                preference: actorDb5.query['preference'].findMany({}),
                product: actorDb5.query['product'].findMany({}),
                stock: actorDb5.query['stock'].findMany({}),
              },
            },
          ),
        },
      }),
    },
  },
  services: {
    catalog: makeService({
      name: 'catalog',
      module: {
        '1.0.0': {
          models: { product: purchaseProduct },
          contracts: {
            createProduct: makeContractVersion(
              defineContract('createProduct'),
              {
                version: '1.0.0',
                models: { product: purchaseProduct },
                payload: { id: primitives.foreignKey({ abbreviation: 'prd' }) },
                program: ({ models, payload }) =>
                  models.product
                    .create({
                      resourceId: payload.id,
                      attributes: { name: 'Test', price: 1 },
                    })
                    .pipe(Effect.map(mutation => [mutation])),
              },
            ),
          },
          automations: {},
        },
      },
    }),
    admission: admissionService,
    app,
    inventory,
    serviceAutomation,
    fulfillment: fulfillmentService,
  },
  name: 'system-worker',
});

const config = makeSystemConfig(system, {
  systemId: 'sys_local_plan071',
});

export default config;
