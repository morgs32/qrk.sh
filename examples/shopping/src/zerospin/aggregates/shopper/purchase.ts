import { makePurchaseModule } from '@zerospin/purchase/server';

import {
  shopperSelectionSchema,
  type shopperIdentitySchema,
} from './actors/identities';
import { removeFromCartV2 } from './contracts/removeFromCart/removeFromCartV2';
import { purchaseFrontend } from './purchaseFrontend';
export const purchase = makePurchaseModule<
  typeof purchaseFrontend.contracts.confirmCheckout.models,
  typeof shopperIdentitySchema,
  typeof shopperSelectionSchema,
  typeof removeFromCartV2
>({
  frontend: purchaseFrontend,
  selectionIdentitySchema: shopperSelectionSchema,
  resolveUserId: ({ queryDb, identity }) =>
    queryDb.query.user
      .findFirst({ where: { clerkUserId: { eq: identity.clerkUserId } } })
      .sync()?.id,
  cartContracts: { removeFromCart: removeFromCartV2 },
});
