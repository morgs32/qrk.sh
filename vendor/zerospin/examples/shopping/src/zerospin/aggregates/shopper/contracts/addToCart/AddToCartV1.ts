import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { productV1 } from '../../../../services/app/models/product/ProductV1';
import { cart } from '../../models/cart/cart';
import { type cartV1 } from '../../models/cart/CartV1';
import { cartItem } from '../../models/cartItem/cartItem';
import { cartItemV1 } from '../../models/cartItem/CartItemV1';
import { productReplicaV1 } from '../../models/productReplica/ProductReplicaV1';

import { addToCart } from './addToCart';

export const addToCartV1 = sdk.makeContractVersion(addToCart, {
  payload: {
    cartId: sdk.primitives.foreignKey({ abbreviation: cart.abbreviation }),
    cartItemId: sdk.primitives.foreignKey({
      abbreviation: cartItem.abbreviation,
    }),
    product: sdk.primitives.json({ schema: productV1.resourceSchema }),
  },
  guard: ({
    db,
    payload,
  }: {
    db: Readonly<
      Pick<
        sdk.IDb<
          sdk.IResourceDbConfig<{ cart: typeof cartV1 }, Record<never, never>>
        >,
        'query'
      >
    >;
    payload: { cartId: sdk.InferResource<typeof cartV1>['id'] };
  }) =>
    Effect.gen(function* () {
      const resource = yield* Effect.try({
        try: () =>
          db.query.cart
            .findFirst({ where: { id: { eq: payload.cartId } } })
            .sync(),
        catch: sdk.ZerospinError.catch({
          code: 'cart-guard-query-failed',
          message: 'Failed to query cart during guard evaluation',
        }),
      });
      if (resource === undefined) {
        return yield* new sdk.ZerospinError({
          code: 'cart-not-found',
          message: `cart ${payload.cartId} was not found`,
        });
      }
    }),
  models: { productReplica: productReplicaV1, cartItem: cartItemV1 },
  program: ({ payload, models }) => {
    const { cartItemId, cartId, product } = payload;
    return Effect.all({
      product: models.productReplica.replicate(product),
      cartItem: models.cartItem.create({
        resourceId: cartItemId,
        attributes: {
          cartId,
          productId: product.id,
        },
      }),
    });
  },
  version: '1.0.0',
});
