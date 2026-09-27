import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import {
  purchaseFrontend,
  purchaseHost,
  purchaseIdentity,
} from './browserConsumer.typecheck.js';
import { makePurchaseModule } from './server.js';
const removeFromCart = makeContractVersion(defineContract('removeFromCart'), {
  version: '1.0.0',
  models: {
    user: purchaseHost.user,
    cart: purchaseHost.cart,
    cartItem: purchaseHost.cartItem,
    checkout: purchaseFrontend.models.checkout,
  },
  payload: {
    releaseCheckoutIds: primitives.json({
      schema: Schema.Array(Schema.String),
    }),
  },
  program: () => Effect.succeed([]),
});
export const purchase: ReturnType<
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

// Provider requirements remain part of the inferred automation Effect.
function checkProviderRequirements(
  payment: ReturnType<typeof purchase.automations.processPayment.program>,
  promotion: ReturnType<typeof purchase.automations.reservePromotion.program>,
) {
  // @ts-expect-error Collection requires the host's PaymentProvider.
  const missingPayment: Effect.Effect<unknown, unknown> = payment;
  // @ts-expect-error Promotion coordination requires the host's PromotionProvider.
  const missingPromotion: Effect.Effect<unknown, unknown> = promotion;
  return { missingPayment, missingPromotion };
}
void checkProviderRequirements;
