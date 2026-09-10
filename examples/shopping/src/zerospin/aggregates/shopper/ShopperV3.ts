import { aggregates, makeSelection } from '@zerospin/sdk';

import { addToCartV3 } from './contracts/addToCart/AddToCartV3';
import { cartItemV3 } from './models/cartItem/CartItemV3';
import type { IClerkUserId } from './models/user/UserV1';
import { shopperV2 } from './ShopperV2';

export const shopperV3 = aggregates.upgradeVersion(shopperV2, {
  version: '3.0.0',
  models: { cartItem: cartItemV3 },
  contracts: { addToCart: { contract: addToCartV3 } },
  selections: {
    cartItem: makeSelection({
      model: cartItemV3,
      where: ({ userId }: { userId: IClerkUserId }) => ({
        cart: { user: { clerkUserId: userId } },
      }),
    }),
  },
});
