import { RoutePattern } from '@remix-run/route-pattern';
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/make/makeAggregateVersion';
import type { IAuthoredAggregate } from '@zerospin/core/aggregate/types';
import { defineAggregateActor } from '@zerospin/core/aggregateActor/defineAggregateActor';
import {
  makeAggregateActorVersion,
  type IAggregateActorVersion,
} from '@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import {
  makeActorDbVersion,
  type IActorDbVersion,
} from '@zerospin/core/models/make/makeActorDbVersion';
import { ContractError } from '@zerospin/error';
import { makeFulfillmentFrontendModule } from '@zerospin/fulfillment/browser';
import {
  makeFulfillmentGuards,
  makeFulfillmentModule,
} from '@zerospin/fulfillment/server';
import {
  makePurchaseGuards,
  makePurchaseModule,
} from '@zerospin/purchase/server';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { fulfillmentService } from './fulfillmentService.js';
import {
  purchaseFrontend,
  purchaseHost,
  purchaseIdentity,
} from './purchaseModels.js';
const { user, cart, cartItem, product } = purchaseHost;
const {
  checkout,
  purchase: purchaseModel,
  purchaseItem,
  paymentIntent,
  cartPromotion,
} = purchaseFrontend.models;
const removeFromCart = makeContractVersion(defineContract('removeFromCart'), {
  version: '1.0.0',
  identity: purchaseIdentity,
  models: { user, cart, cartItem, checkout },
  payload: {
    id: primitives.foreignKey({ abbreviation: 'cit' }),
    releaseCheckoutIds: primitives.json({
      schema: Schema.Array(Schema.String),
    }),
  },
  program: ({ models, payload }) =>
    models.cartItem
      .delete({ resourceId: payload.id })
      .pipe(Effect.map(mutation => [mutation])),
});
const purchase: ReturnType<
  typeof makePurchaseModule<
    typeof purchaseHost,
    typeof purchaseIdentity,
    typeof purchaseIdentity,
    typeof removeFromCart
  >
> = makePurchaseModule<
  typeof purchaseHost,
  typeof purchaseIdentity,
  typeof purchaseIdentity,
  typeof removeFromCart
>({
  frontend: purchaseFrontend,
  selectionIdentitySchema: purchaseIdentity,
  resolveUserId: ({ queryDb, identity }) =>
    queryDb.query.user
      .findMany()
      .sync()
      .find(user => user.id === identity.userId)?.id,
  cartContracts: { removeFromCart },
});
const resolvePurchaseOwner = ({
  queryDb,
  identity,
  purchaseId,
}: {
  queryDb: Pick<
    IDb<
      IResourceDbConfig<
        {
          user: typeof user;
          cart: typeof cart;
          purchase: typeof purchaseModel;
        },
        Record<never, never>
      >
    >,
    'query'
  >;
  identity: { aggregateId: string; userId: string };
  purchaseId: string;
}) => {
  const row = queryDb.query.purchase
    .findMany()
    .sync()
    .find(row => row.id === purchaseId);
  if (!row) return undefined;
  const owner = queryDb.query.cart
    .findFirst({ where: { id: { eq: row.cartId } } })
    .sync();
  return owner?.userId === identity.userId
    ? {
        userId: identity.userId,
        aggregateId: identity.aggregateId,
        status: row.status,
      }
    : undefined;
};
const frontend = makeFulfillmentFrontendModule({
  models: { user, cart, purchase: purchaseModel },
  source: fulfillmentService.versions['1.0.0'],
  identitySchema: purchaseIdentity,
  resolvePurchaseOwner,
});
const fulfillment = makeFulfillmentModule<
  typeof frontend.contracts.requestPacking.models,
  typeof purchaseIdentity,
  typeof purchaseIdentity,
  typeof purchase.contracts.recordPaymentObservation
>({
  frontend,
  paid: purchase.contracts.recordPaymentObservation,
  selectionIdentitySchema: purchaseIdentity,
  resolvePurchaseOwner,
});
const prepareCart = makeContractVersion(defineContract('prepareCart'), {
  version: '1.0.0',
  identity: purchaseIdentity,
  models: { user, cart, cartItem, product },
  payload: {
    userId: primitives.foreignKey({ abbreviation: 'usr' }),
    cartId: primitives.foreignKey({ abbreviation: 'crt' }),
    cartItemId: primitives.foreignKey({ abbreviation: 'cit' }),
    product: primitives.json({
      schema: product.sourceModel.resourceSchema,
    }),
  },
  failures: {
    denied: ContractError.schema({ code: 'fixture-owner-denied' }),
  },
  guard: Effect.fn(function* ({ identity, payload, failures }) {
    if (identity.userId !== payload.userId) {
      return yield* failures.denied.make({ message: 'User mismatch' });
    }
  }),
  program: ({ models, payload }) =>
    Effect.all([
      models.user.create({
        resourceId: payload.userId,
        attributes: { name: 'Fixture' },
      }),
      models.cart.create({
        resourceId: payload.cartId,
        attributes: { userId: payload.userId },
      }),
      models.product.replicate(payload.product),
      models.cartItem.create({
        resourceId: payload.cartItemId,
        attributes: {
          cartId: payload.cartId,
          productId: payload.product.id,
          amount: 1,
        },
      }),
    ]),
});
const models = {
  user,
  cart,
  cartItem,
  product,
  checkout,
  purchase: purchaseModel,
  purchaseItem,
  paymentIntent,
  cartPromotion,
  fulfillment: fulfillment.models.fulfillment,
  fulfillmentOperation: fulfillment.models.fulfillmentOperation,
};
const db: IActorDbVersion<typeof models> = makeActorDbVersion({ models });
const identity = makeActorIdentity({
  schema: purchaseIdentity,
  actorPath: RoutePattern.parse('/:aggregateId/:userId'),
});
const actorContracts = {
  prepareCart,
  removeFromCart,
  confirmCheckout: purchase.contracts.confirmCheckout,
  initiatePayment: purchase.contracts.initiatePayment,
  cancelPurchase: purchase.contracts.cancelPurchase,
  applyPromotion: purchase.contracts.applyPromotion,
  removePromotion: purchase.contracts.removePromotion,
  requestPacking: fulfillment.contracts.requestPacking,
  requestShipping: fulfillment.contracts.requestShipping,
};
const actorAutomations: typeof purchase.automations &
  typeof fulfillment.automations = {
  ...purchase.automations,
  ...fulfillment.automations,
};
const actorQueries = {
  user: db.query.user.findMany({
    where: { id: { eq: identity.sql.placeholder('userId') } },
  }),
  cart: db.query.cart.findMany({
    where: { userId: { eq: identity.sql.placeholder('userId') } },
  }),
  cartItem: db.query.cartItem.findMany({
    where: { cart: { userId: { eq: identity.sql.placeholder('userId') } } },
  }),
  product: db.query.product.findMany(),
  checkout: db.query.checkout.findMany({
    where: { userId: { eq: identity.sql.placeholder('userId') } },
  }),
  purchase: db.query.purchase.findMany({
    where: { cart: { userId: { eq: identity.sql.placeholder('userId') } } },
  }),
  purchaseItem: db.query.purchaseItem.findMany({
    where: {
      purchase: {
        cart: { userId: { eq: identity.sql.placeholder('userId') } },
      },
    },
  }),
  paymentIntent: db.query.paymentIntent.findMany({
    where: {
      purchase: {
        cart: { userId: { eq: identity.sql.placeholder('userId') } },
      },
    },
  }),
  cartPromotion: db.query.cartPromotion.findMany({
    where: { cart: { userId: { eq: identity.sql.placeholder('userId') } } },
  }),
  fulfillment: db.query.fulfillment.findMany({
    where: { userId: { eq: identity.sql.placeholder('userId') } },
  }),
  fulfillmentOperation: db.query.fulfillmentOperation.findMany({
    where: {
      fulfillment: { userId: { eq: identity.sql.placeholder('userId') } },
    },
  }),
};
const shopper: IAggregateActorVersion<
  'shopper',
  '1.0.0',
  typeof db,
  typeof identity,
  typeof actorQueries,
  typeof actorContracts,
  never,
  never,
  typeof actorAutomations
> = makeAggregateActorVersion(defineAggregateActor({ name: 'shopper' }), {
  version: '1.0.0',
  authentication: 'none',
  db,
  identity,
  contracts: actorContracts,
  automations: actorAutomations,
  queries: actorQueries,
});
export const purchaseAggregate: IAuthoredAggregate<
  'purchaseUser',
  typeof db.models,
  { shopper: typeof shopper },
  '1.0.0',
  never,
  typeof purchase.contracts &
    typeof fulfillment.contracts & {
      prepareCart: typeof prepareCart;
      removeFromCart: typeof removeFromCart;
    },
  typeof shopper.automations
> = makeAggregateVersion<
  'purchaseUser',
  typeof purchaseHost,
  { prepareCart: typeof prepareCart; removeFromCart: typeof removeFromCart },
  {},
  { shopper: typeof shopper },
  '1.0.0',
  never,
  { purchase: typeof purchase; fulfillment: typeof fulfillment }
>(defineAggregate({ name: 'purchaseUser' }), {
  version: '1.0.0',
  models: { user, cart, cartItem, product },
  contracts: { prepareCart, removeFromCart },
  modules: { purchase, fulfillment },
  actors: { shopper },
  guards: {
    shopper: {
      ...makePurchaseGuards(purchase),
      ...makeFulfillmentGuards(fulfillment),
    },
  },
});
