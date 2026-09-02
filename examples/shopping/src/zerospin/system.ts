import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { makeSelection, makeSystem, ZerospinError } from '@zerospin/sdk';
import { Effect, Schema } from 'effect';

import { signature } from './signature';
import { addToCart } from './contracts/addToCart';
import { createCart } from './contracts/createCart';
import { createCatalogMarker } from './contracts/createCatalogMarker';
import { createProduct } from './contracts/createProduct';
import { createUser } from './contracts/createUser';
import { deleteProduct } from './contracts/deleteProduct';
import { removeFromCart } from './contracts/removeFromCart';
import { updateCartItemQuantity } from './contracts/updateCartItemQuantity';
import { updateUser } from './contracts/updateUser';
import { catalog } from './frontends/catalog';
import { web } from './frontends/web';
import { Cart } from './models/Cart';
import { CartItem } from './models/CartItem';
import { CatalogMarker } from './models/CatalogMarker';
import { Product } from './models/Product';
import { ProductReplica } from './models/ProductReplica';
import { User, type IClerkUserId } from './models/User';

export const system = makeSystem({
  name: 'shopping',
  version: '2.0.2',
  authentication: {
    signature,
    authenticate: ({ signature }) => Effect.succeed(signature.clerkUserId),
  },
  aggregates: {
    shopper: {
      authorize: () => Effect.void,
      models: {
        user: User,
        cart: Cart,
        cartItem: CartItem,
        product: ProductReplica,
      },
      contracts: {
        addToCart,
        createCart,
        createUser,
        removeFromCart,
        updateCartItemQuantity,
        updateUser,
      },
      selections: {
        user: makeSelection({
          model: User,
          where: ({ userId }: { userId: IClerkUserId }) => ({
            clerkUserId: userId,
          }),
        }),
        cart: makeSelection({
          model: Cart,
          where: ({ userId }: { userId: IClerkUserId }) => ({
            user: { clerkUserId: userId },
          }),
        }),
        cartItem: makeSelection({
          model: CartItem,
          where: ({ userId }: { userId: IClerkUserId }) => ({
            cart: { user: { clerkUserId: userId } },
          }),
        }),
        product: makeSelection({
          model: ProductReplica,
          where: ({ userId }: { userId: IClerkUserId }) => ({
            cartItems: {
              cart: { user: { clerkUserId: userId } },
            },
          }),
        }),
      },
      queries: {
        getProducts: { service: 'app', query: 'getProducts' },
      },
      frontends: {
        web: {
          controller: web,
        },
      },
    },
  },
  services: {
    app: {
      authorize: () => Effect.void,
      models: {
        catalogMarker: CatalogMarker,
        product: Product,
      },
      contracts: {
        createCatalogMarker,
        createProduct,
        deleteProduct,
      },
      queries: {
        getProducts: {
          paramsSchema: Schema.Struct({}),
          query: Effect.fn('getProducts')(function* ({
            db,
          }: {
            db: Readonly<
              Pick<
                IDb<
                  IResourceDbConfig<
                    {
                      catalogMarker: typeof CatalogMarker;
                      product: typeof Product;
                    },
                    Record<never, never>
                  >
                >,
                'query'
              >
            >;
            params: {};
          }) {
            return yield* Effect.try({
              try: () => db.query.product.findMany().sync(),
              catch: ZerospinError.catch({
                code: 'catalog-products-query-failed',
                message: 'Failed to query catalog products',
              }),
            });
          }),
        },
      },
      frontends: {
        catalog: {
          controller: catalog,
        },
      },
    },
  },
});
