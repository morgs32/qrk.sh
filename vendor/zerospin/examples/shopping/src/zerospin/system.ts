import { makeAccountController } from '@zerospin/core/accountController/makeAccountController';
import { makeActorApi } from '@zerospin/core/actorController/makeActorApi';
import { makeActorController } from '@zerospin/core/actorController/makeActorController';
import { makeSelection } from '@zerospin/core/models/makeSelection';
import { makeServiceController } from '@zerospin/core/service/makeServiceController';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { createProduct } from './contracts';
import { shopperFrontend } from './frontend';
import { Cart, CartItem, Product, User } from './models';

export const appService = makeServiceController({
  name: 'app',
  version: '1.0.0',
  models: { product: Product },
  contracts: { createProduct },
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
            contractName: 'createUser',
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
  contracts: shopperActor.frontends.web!.contracts,
});

export const system = makeSystem({
  accountControllers: {
    user: userAccount,
  },
  serviceControllers: {
    app: appService,
  },
  name: 'shopping',
  version: '1.0.2',
});
