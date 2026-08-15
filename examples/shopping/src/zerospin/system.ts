import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeSelection, makeSystem, ZerospinError } from '@zerospin/sdk';
import { Effect, Schema } from 'effect';

import { authenticationSignature } from './authentication';
import {
  addToCart,
  createCart,
  createCatalogMarker,
  createProduct,
  createUser,
  removeFromCart,
  updateCartItemQuantity,
  updateUser,
} from './contracts';
import { catalog } from './frontends/catalog';
import { web } from './frontends/web';
import {
  Cart,
  CartItem,
  CatalogMarker,
  Product,
  User,
  type IClerkUserId,
} from './models';

const catalogModels = getFrontendDbModels(catalog);

export const system = makeSystem({
  name: 'shopping',
  version: '2.0.2',
  authentication: {
    signature: authenticationSignature,
    authenticate: ({ signature }) => Effect.succeed(signature.clerkUserId),
  },
  aggregates: {
    shopper: {
      authorize: () => Effect.void,
      models: {
        user: User,
        cart: Cart,
        cartItem: CartItem,
        product: Product,
      },
      contracts: {
        addToCart,
        createCart,
        createUser,
        removeFromCart,
        updateCartItemQuantity,
        updateUser,
      },
      mutationAdapters: {
        cartItem: {
          create: [
            {
              source: CartItem.createMutation('1.0.0'),
              destination: CartItem.createMutation('2.0.0'),
              adapter: mutation =>
                CartItem.create('2.0.0', {
                  resourceId: mutation.resourceId,
                  attributes: {
                    amount: mutation.operation.attributes.quantity,
                    cartId: mutation.operation.attributes.cartId,
                    productId: mutation.operation.attributes.productId,
                    unit: 'item',
                  },
                }),
            },
          ],
          update: [
            {
              source: CartItem.updateMutation('1.0.0'),
              destination: CartItem.updateMutation('2.0.0'),
              adapter: mutation => {
                const quantity = mutation.operation.attributes.quantity;
                return CartItem.update('2.0.0', {
                  resourceId: mutation.resourceId,
                  attributes: {
                    ...(mutation.operation.attributes.cartId === undefined
                      ? {}
                      : { cartId: mutation.operation.attributes.cartId }),
                    ...(mutation.operation.attributes.productId === undefined
                      ? {}
                      : {
                          productId: mutation.operation.attributes.productId,
                        }),
                    ...(quantity === undefined
                      ? {}
                      : { amount: quantity, unit: 'item' }),
                  },
                  ...(mutation.operation.mask === undefined
                    ? {}
                    : {
                        mask: mutation.operation.mask.flatMap(attribute => {
                          switch (attribute) {
                            case 'cartId':
                            case 'productId':
                              return [attribute];
                            case 'quantity':
                              return ['amount', 'unit'];
                            default:
                              return [];
                          }
                        }),
                      }),
                });
              },
            },
          ],
          delete: [
            {
              source: CartItem.deleteMutation('1.0.0'),
              destination: CartItem.deleteMutation('2.0.0'),
              adapter: mutation =>
                CartItem.delete('2.0.0', {
                  resourceId: mutation.resourceId,
                }),
            },
          ],
          move: [
            {
              source: CartItem.moveMutation('1.0.0'),
              destination: CartItem.moveMutation('2.0.0'),
              adapter: mutation =>
                CartItem.move('2.0.0', {
                  resourceId: mutation.resourceId,
                  property: mutation.operation.property,
                  prevId: mutation.operation.prevId,
                  nextId: mutation.operation.nextId,
                }),
            },
          ],
        },
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
          model: Product,
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
                  IResourceDbConfig<typeof catalogModels, Record<never, never>>
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
