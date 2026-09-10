import { aggregates, makeSelection } from '@zerospin/sdk';

import { addToCartV2 } from './contracts/addToCart/AddToCartV2';
import { removeFromCartV2 } from './contracts/removeFromCart/removeFromCartV2';
import { updateCartItemQuantityV1 } from './contracts/updateCartItemQuantity/UpdateCartItemQuantityV1';
import { cartItemV2 } from './models/cartItem/CartItemV2';
import type { IClerkUserId } from './models/user/UserV1';
import { shopperV1 } from './ShopperV1';

export const shopperV2 = aggregates.upgradeVersion(shopperV1, {
  version: '2.0.0',
  models: { cartItem: cartItemV2 },
  contracts: {
    addToCart: { contract: addToCartV2 },
    removeFromCart: { contract: removeFromCartV2 },
    updateCartItemQuantity: { contract: updateCartItemQuantityV1 },
  },
  selections: {
    cartItem: makeSelection({
      model: cartItemV2,
      where: ({ userId }: { userId: IClerkUserId }) => ({
        cart: { user: { clerkUserId: userId } },
      }),
    }),
  },
});
