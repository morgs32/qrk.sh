import { makeAccountController } from '@zerospin/core/accountController/makeAccountController';
import { makeActorApi } from '@zerospin/core/actorController/makeActorApi';
import { makeActorController } from '@zerospin/core/actorController/makeActorController';
import { makeSelection } from '@zerospin/core/models/makeSelection';
import { makeServiceController } from '@zerospin/core/service/makeServiceController';
import { makeServiceActorController } from '@zerospin/core/serviceActorController/makeServiceActorController';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { prefixActorId } from '@zerospin/core/utils/prefixActorId';
import { ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

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
import { catalogFrontend, shopperFrontend } from './frontend';
import { Cart, CartItem, CatalogMarker, Product, User } from './models';

export const catalogViewerActor = makeServiceActorController({
  name: 'catalogViewer',
  version: '1.0.0',
  models: {
    product: Product,
  },
  frontends: {
    catalog: {
      frontendController: catalogFrontend,
      authenticate: ({ db, signature }) =>
        Effect.gen(function* () {
          // The service-owned authentication boundary must pass a new query-only
          // object, not the source ServiceRepo database with its writable API.
          if (Reflect.has(db, '$client')) {
            return yield* new ZerospinError({
              code: 'service-frontend-auth-writable-surface-leaked',
              message:
                'Service frontend authentication received the database client',
            });
          }
          if (Reflect.has(db, 'insert')) {
            return yield* new ZerospinError({
              code: 'service-frontend-auth-writable-surface-leaked',
              message:
                'Service frontend authentication received the database insert API',
            });
          }
          if (Reflect.has(db, 'update')) {
            return yield* new ZerospinError({
              code: 'service-frontend-auth-writable-surface-leaked',
              message:
                'Service frontend authentication received the database update API',
            });
          }
          if (Reflect.has(db, 'delete')) {
            return yield* new ZerospinError({
              code: 'service-frontend-auth-writable-surface-leaked',
              message:
                'Service frontend authentication received the database delete API',
            });
          }
          if (Reflect.has(db, 'transaction')) {
            return yield* new ZerospinError({
              code: 'service-frontend-auth-writable-surface-leaked',
              message:
                'Service frontend authentication received the database transaction API',
            });
          }

          // Authentication may inspect only the actor-readable service view.
          // The runtime registry must omit service-owned models that this actor
          // cannot read, even when code probes by a dynamically supplied name.
          if (Reflect.has(db.query, 'catalogMarker')) {
            return yield* new ZerospinError({
              code: 'service-frontend-auth-query-leaked',
              message:
                'Service frontend authentication received the hidden catalogMarker model',
            });
          }

          // Reading the approved model proves that filtering retained the
          // intended query without coupling identity to the product count.
          db.query.product.findMany().sync();
          return prefixActorId(signature.viewerId);
        }),
    },
  },
});

export const appService = makeServiceController({
  name: 'app',
  version: '1.1.0',
  models: {
    catalogMarker: CatalogMarker,
    product: Product,
  },
  contracts: {
    createCatalogMarker,
    createProduct,
  },
  actorControllers: {
    catalogViewer: catalogViewerActor,
  },
  queries: {
    getProducts: {
      paramsSchema: Schema.Struct({}),
      query: Effect.fn('getProducts')(function* ({ db }) {
        return db.query.product.findMany().sync();
      }),
    },
  },
});

export const shopperApi = makeActorApi({
  getProducts: appService.queries.getProducts,
});

export const shopperActor = makeActorController({
  name: 'shopper',
  version: '1.0.0',
  api: shopperApi,
  models: {
    user: User,
    cart: Cart,
    cartItem: CartItem,
    product: Product,
  },
  selections: {
    user: makeSelection({
      model: User,
      where: ({ actorId }) => ({ actorId }),
    }),
    cart: makeSelection({
      model: Cart,
      where: ({ actorId }) => ({
        user: { actorId },
      }),
    }),
    cartItem: makeSelection({
      model: CartItem,
      where: ({ actorId }) => ({
        cart: { user: { actorId } },
      }),
    }),
    product: makeSelection({
      model: Product,
      where: ({ actorId }) => ({
        cartItems: {
          cart: { user: { actorId } },
        },
      }),
    }),
  },
  frontends: {
    web: {
      frontendController: shopperFrontend,
      authenticate: ({
        signature,
        db,
        makeAccountCommand,
        finalizeAccountCommands,
      }) =>
        Effect.gen(function* () {
          const accountId = makeAccountId({ id: '1' });
          const userId = User.prefixId(signature.clerkUserId);
          const user = db.query.user
            .findFirst({
              where: { id: { eq: userId } },
            })
            .sync();
          if (user !== undefined) {
            return {
              actorId: user.actorId,
              accountId,
            };
          }

          const createUserCommand = yield* makeAccountCommand({
            contract: createUser,
            payload: {
              id: userId,
              clerkUserId: signature.clerkUserId,
            },
          });

          yield* finalizeAccountCommands({
            commands: [createUserCommand],
          });

          const createdUser = db.query.user
            .findFirst({
              where: { id: { eq: userId } },
            })
            .sync();

          if (createdUser === undefined) {
            return yield* new ZerospinError({
              code: 'user-create-failed',
              message: `User ${userId} was not created`,
              status: 500,
            });
          }

          return {
            actorId: createdUser.actorId,
            accountId,
          };
        }),
    },
  },
});

export const userAccount = makeAccountController({
  name: 'user',
  version: '1.0.0',
  actorControllers: {
    shopper: shopperActor,
  },
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
});

export const system = makeSystem({
  accountControllers: {
    user: userAccount,
  },
  serviceControllers: {
    app: appService,
  },
  name: 'shopping',
  version: '1.1.0',
});
