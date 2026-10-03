import * as sdk from '@zerospin/sdk';
import { Effect, Schema } from 'effect';

import { catalogActorV1 } from './actors/catalogActorV1';
import { shopperActorV1 } from './actors/shopperActorV1';
import { mappedAddToCartV1 } from './contracts/addToCart/mappedAddToCartV1';
import { createCartV1 } from './contracts/createCart/CreateCartV1';
import { createProductV1 } from './contracts/createProduct/CreateProductV1';
import { deleteProductV1 } from './contracts/deleteProduct/DeleteProductV1';
import { removeFromCartV1 } from './contracts/removeFromCart/RemoveFromCartV1';
import { updateCartItemQuantityV1 } from './contracts/updateCartItemQuantity/UpdateCartItemQuantityV1';
import { cartV1 } from './models/cart/CartV1';
import { cartItemV1 } from './models/cartItem/CartItemV1';
import { productV1 } from './models/product/ProductV1';

export const marketplaceServiceV1 = sdk.makeServiceVersion(
  sdk.defineService({ name: 'marketplace' }),
  {
    version: '1.0.0',
    models: { product: productV1, cart: cartV1, cartItem: cartItemV1 },
    actors: { catalog: catalogActorV1, shopper: shopperActorV1 },
    contracts: {
      createProduct: createProductV1,
      deleteProduct: deleteProductV1,
      createCart: createCartV1,
      addToCart: mappedAddToCartV1,
      removeFromCart: removeFromCartV1,
      updateCartItemQuantity: updateCartItemQuantityV1,
    },
    queries: {
      getProducts: {
        paramsSchema: Schema.Struct({}),
        query: ({ db }) => Effect.succeed(db.query.product.findMany().sync()),
      },
    },
  },
);
