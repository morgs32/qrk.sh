import { makePurchaseModule } from '@zerospin/purchase/server';

import { userClaims, type shopperClaims } from '../../claims';

import { removeFromCartV2 } from './contracts/removeFromCart/removeFromCartV2';
import { purchaseFrontend } from './purchaseFrontend';
export const purchase = makePurchaseModule<
  typeof purchaseFrontend.contracts.confirmCheckout.models,
  typeof shopperClaims,
  typeof userClaims,
  typeof removeFromCartV2
>({
  frontend: purchaseFrontend,
  selectionIdentitySchema: userClaims,
  resolveUserId: ({ queryDb, claims }) =>
    queryDb.query.user
      .findFirst({ where: { clerkUserId: { eq: claims.clerkUserId } } })
      .sync()?.id,
  cartContracts: { removeFromCart: removeFromCartV2 },
});
