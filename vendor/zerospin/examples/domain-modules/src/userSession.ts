import { makeSession } from '@zerospin/browser';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import {
  makeFulfillmentFrontendModule,
  makeFulfillmentModelV1,
} from '@zerospin/fulfillment/browser';
import { Layer, Redacted, Schema } from 'effect';

import {
  purchaseFrontend as purchase,
  purchaseHost,
  purchaseIdentity,
} from './purchase.js';

const fulfillment = makeFulfillmentFrontendModule({
  models: {
    user: purchaseHost.user,
    cart: purchaseHost.cart,
    purchase: purchase.models.purchase,
  },
  claimsSchema: purchaseIdentity,
  resolvePurchaseOwner: ({ db, claims, purchaseId }) => {
    const row = db.query.purchase
      .findMany()
      .sync()
      .find(row => row.id === purchaseId);
    const cart =
      row &&
      db.query.cart.findFirst({ where: { id: { eq: row.cartId } } }).sync();
    return cart?.userId === claims.userId && row
      ? {
          userId: claims.userId,
          aggregateId: claims.aggregateId,
          status: row.status,
        }
      : undefined;
  },
  source: {
    name: 'fulfillment',
    version: '1.0.0',
    models: { fulfillment: makeFulfillmentModelV1() },
  },
});
const claimsSchema = Schema.Struct({
  aggregateId: Schema.String,
  userId: Schema.String,
});
const layer = Layer.mergeAll(
  Layer.succeed(ZerospinApiUrl, 'http://localhost:3000'),
  Layer.succeed(PublishableKey, Redacted.make('pk_fixture')),
);

/** The session installs the actual browser-safe purchase and fulfillment declarations. */
export const userSession = makeSession({
  sharedWorker: ({ name }) =>
    new SharedWorker(new URL('./zerospin.worker.ts', import.meta.url), {
      type: 'module',
      name,
    }),
  kind: 'aggregate',
  aggregateName: 'shopper',
  aggregateVersion: '1.0.0',
  actorName: 'user',
  actorVersion: '1.0.0',
  sessionName: 'user',
  systemName: 'shop',
  claimsSchema,
  layer,
  modules: { purchase, fulfillment },
  models: purchaseHost,
});

/** Compile-only checks for the selected browser surface. */
export function checkUserSessionDeclarations() {
  const confirm = userSession.definition.contracts.confirmCheckout;
  const replicatedFulfillment = userSession.definition.models.fulfillment;
  // @ts-expect-error The server-only completion command is not attached.
  void userSession.definition.contracts.recordFulfillmentOperation;
  // @ts-expect-error Selecting a replica does not grant a fulfillment command.
  const markPacked = userSession.definition.contracts.markPacked;
  return { confirm, replicatedFulfillment, markPacked };
}
