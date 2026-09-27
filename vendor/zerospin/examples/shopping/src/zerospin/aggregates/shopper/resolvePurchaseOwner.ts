import type * as sdk from '@zerospin/sdk/browser';

import { type cartV1 } from './models/cart/CartV1';
import { type userV1 } from './models/user/UserV1';
import { type purchaseFrontend } from './purchaseFrontend';
export const resolvePurchaseOwner = ({
  queryDb,
  claims,
  purchaseId,
}: {
  queryDb: Pick<
    sdk.IDb<
      sdk.IResourceDbConfig<
        {
          purchase: typeof purchaseFrontend.models.purchase;
          cart: typeof cartV1;
          user: typeof userV1;
        },
        Record<never, never>
      >
    >,
    'query'
  >;
  claims: { clerkUserId: string };
  purchaseId: string;
}) => {
  const user = queryDb.query.user
    .findFirst({ where: { clerkUserId: { eq: claims.clerkUserId } } })
    .sync();
  const purchase = queryDb.query.purchase
    .findMany()
    .sync()
    .find(row => row.id === purchaseId);
  if (user === undefined || purchase === undefined) return undefined;
  const cart = queryDb.query.cart
    .findFirst({ where: { id: { eq: purchase.cartId } } })
    .sync();
  return cart?.userId === user.id
    ? { userId: user.id, aggregateId: 'acct_1', status: purchase.status }
    : undefined;
};
