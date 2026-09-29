import { makePurchaseModule } from '@zerospin/purchase/server';

import { userClaims, type shopperClaims } from '../../claims';

import { purchaseFrontend } from './purchaseFrontend';
export const purchase = makePurchaseModule<
  typeof purchaseFrontend.contracts.confirmCheckout.models,
  typeof shopperClaims,
  typeof userClaims
>({
  frontend: purchaseFrontend,
  selectionIdentitySchema: userClaims,
  resolveUserId: ({ db, claims }) =>
    db.query.user
      .findFirst({ where: { clerkUserId: { eq: claims.clerkUserId } } })
      .sync()?.id,
});
