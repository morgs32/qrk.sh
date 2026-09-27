import { makePurchaseFrontendModule } from '@zerospin/purchase/browser';
import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { shopperClaims } from '../../claims';

import { cartV1 } from './models/cart/CartV1';
import { cartItemV3 } from './models/cartItem/CartItemV3';
import { productReplicaV1 } from './models/productReplica/ProductReplicaV1';
import { userV1 } from './models/user/UserV1';
import { purchaseFrontend } from './purchaseFrontend';
const next = makePurchaseFrontendModule(
  {
    models: {
      user: userV1,
      cart: cartV1,
      cartItem: cartItemV3,
      product: productReplicaV1,
    },
    claimsSchema: shopperClaims,
    resolveUserId: ({ queryDb, claims }) =>
      queryDb.query.user
        .findFirst({ where: { clerkUserId: { eq: claims.clerkUserId } } })
        .sync()?.id,
    readQuantity: item => item.quantity,
  },
  purchaseFrontend.models,
);
const confirmCheckout = sdk.upgradeContractVersion(
  purchaseFrontend.contracts.confirmCheckout,
  {
    version: '2.0.0',
    claims: shopperClaims,
    failures: next.contracts.confirmCheckout.failures,
    models: next.contracts.confirmCheckout.models,
    payload: {},
    up: ({ payload }) => Effect.succeed(payload),
    down: ({ payload }) => Effect.succeed(payload),
    guard: next.contracts.confirmCheckout.guard!,
    program: next.contracts.confirmCheckout.program,
  },
);
const applyPromotion = sdk.upgradeContractVersion(
  purchaseFrontend.contracts.applyPromotion,
  {
    version: '2.0.0',
    claims: shopperClaims,
    failures: next.contracts.applyPromotion.failures,
    models: next.contracts.applyPromotion.models,
    payload: {},
    up: ({ payload }) => Effect.succeed(payload),
    down: ({ payload }) => Effect.succeed(payload),
    guard: next.contracts.applyPromotion.guard!,
    program: next.contracts.applyPromotion.program,
  },
);
export const purchaseFrontendV3 = {
  models: purchaseFrontend.models,
  contracts: {
    confirmCheckout,
    applyPromotion,
    initiatePayment: purchaseFrontend.contracts.initiatePayment,
    cancelPurchase: purchaseFrontend.contracts.cancelPurchase,
    removePromotion: purchaseFrontend.contracts.removePromotion,
  },
  automations: {},
};
