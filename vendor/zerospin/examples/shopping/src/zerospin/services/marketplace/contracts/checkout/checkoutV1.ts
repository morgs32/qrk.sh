import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { userClaims } from '../../../../claims';
import { PurchaseQuote } from '../../../../purchaseQuote';
import { cartV1 } from '../../models/cart/CartV1';
import { cartItemV1 } from '../../models/cartItem/CartItemV1';
import { productV1 } from '../../models/product/ProductV1';

export const checkoutV1 = sdk.makeContractVersion(
  sdk.defineContract('checkout'),
  {
    version: '1.0.0',
    claims: userClaims,
    payload: {
      cartId: sdk.primitives.foreignKey({ abbreviation: 'crt' }),
      purchaseId: sdk.primitives.foreignKey({ abbreviation: 'pur' }),
    },
    models: { cart: cartV1, cartItem: cartItemV1, product: productV1 },
    result: PurchaseQuote,
    failures: {
      unavailable: sdk.ContractError.schema({
        code: 'checkout-cart-unavailable',
      }),
      invalidCart: sdk.ContractError.schema({ code: 'checkout-cart-invalid' }),
    },
    program: ({ payload, claims, db, models, failures }) =>
      Effect.gen(function* () {
        const cart = db.query.cart
          .findFirst({
            where: { id: { eq: payload.cartId } },
            with: { items: { with: { product: true } } },
          })
          .sync();
        if (!cart || cart.userId !== claims.clerkUserId) {
          return yield* failures.unavailable.make({
            message: 'Checkout requires the verified shopper’s cart.',
          });
        }
        if (
          cart.items.length === 0 ||
          cart.items.some(
            item =>
              item.amount <= 0 ||
              !Number.isSafeInteger(item.amount) ||
              !item.product ||
              item.product.price < 0,
          )
        ) {
          return yield* failures.invalidCart.make({
            message:
              'Checkout requires positive quantities and authoritative products.',
          });
        }
        const items = cart.items.map(item => ({
          id: `pit_${payload.purchaseId.slice(4)}_${item.id.slice(4)}` as const,
          productId: item.productId,
          name: item.product.name,
          price: item.product.price,
          quantity: item.amount,
        }));
        const quote = {
          purchaseId: payload.purchaseId,
          items,
          total: items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
          ),
        };
        if (!Number.isSafeInteger(quote.total)) {
          return yield* failures.invalidCart.make({
            message: 'Checkout total exceeds the supported USD range.',
          });
        }
        for (const item of cart.items) {
          yield* models.cartItem.delete({ resourceId: item.id });
        }
        return quote;
      }),
  },
);
