import { makePurchaseFrontendModule } from '@zerospin/purchase/browser';

import { shopperClaims } from '../../claims';

import { cartV1 } from './models/cart/CartV1';
import { cartItemV2 } from './models/cartItem/CartItemV2';
import { productReplicaV1 } from './models/productReplica/ProductReplicaV1';
import { userV1 } from './models/user/UserV1';
export const purchaseFrontend = makePurchaseFrontendModule({
  models: {
    user: userV1,
    cart: cartV1,
    cartItem: cartItemV2,
    product: productReplicaV1,
  },
  claimsSchema: shopperClaims,
  resolveUserId: ({ db, claims }) =>
    db.query.user
      .findFirst({ where: { clerkUserId: { eq: claims.clerkUserId } } })
      .sync()?.id,
  readQuantity: item => item.amount,
});
