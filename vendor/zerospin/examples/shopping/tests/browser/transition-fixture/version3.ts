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
import { Effect } from 'effect';

import {
  createTransitionUserV1,
  setTransitionUserNoteV1,
  transitionStableFrontendV1,
  TransitionUserV1,
} from './version1Frontend';
import {
  createTransitionProductV3,
  renameTransitionUserV3,
  transitionCatalogFrontendV3,
  TransitionProductV3,
  transitionShopperFrontendV3,
} from './version3Frontend';

export const transitionCatalogViewerActorV3 = makeServiceActorController({
  name: 'catalogViewer',
  version: '3.0.0',
  models: {
    transitionProduct: TransitionProductV3,
  },
  frontends: {
    catalog: {
      frontendController: transitionCatalogFrontendV3,
      authenticate: ({ db, signature }) => {
        db.query.transitionProduct.findMany().sync();
        return Effect.succeed(prefixActorId(signature.viewerId));
      },
    },
  },
});

export const transitionAppServiceV3 = makeServiceController({
  name: 'app',
  version: '3.0.0',
  models: {
    transitionProduct: TransitionProductV3,
  },
  contracts: {
    createTransitionProduct: createTransitionProductV3,
  },
  actorControllers: {
    catalogViewer: transitionCatalogViewerActorV3,
  },
  queries: {},
});

export const transitionShopperActorV3 = makeActorController({
  name: 'shopper',
  version: '3.0.0',
  api: makeActorApi({}),
  models: {
    transitionUser: TransitionUserV1,
  },
  selections: {
    transitionUser: makeSelection({
      model: TransitionUserV1,
      where: ({ actorId }) => ({ actorId }),
    }),
  },
  frontends: {
    web: {
      frontendController: transitionShopperFrontendV3,
      authenticate: ({
        signature,
        db,
        makeAccountCommand,
        finalizeAccountCommands,
      }) =>
        Effect.gen(function* () {
          const accountId = makeAccountId({ id: '1' });
          const actorId = prefixActorId(signature.clerkUserId);
          const userId = TransitionUserV1.prefixId(signature.clerkUserId);
          const existingUser = db.query.transitionUser
            .findFirst({ where: { id: { eq: userId } } })
            .sync();
          if (existingUser !== undefined) {
            return { actorId: existingUser.actorId, accountId };
          }
          const command = yield* makeAccountCommand({
            contract: createTransitionUserV1,
            payload: { id: userId, actorId },
          });
          yield* finalizeAccountCommands({ commands: [command] });
          const createdUser = db.query.transitionUser
            .findFirst({ where: { id: { eq: userId } } })
            .sync();
          if (createdUser === undefined) {
            return yield* new ZerospinError({
              code: 'transition-user-create-failed',
              message: 'Transition fixture user was not created',
            });
          }
          return { actorId: createdUser.actorId, accountId };
        }),
    },
    stable: {
      frontendController: transitionStableFrontendV1,
      authenticate: ({ signature, db }) => {
        const accountId = makeAccountId({ id: '1' });
        const userId = TransitionUserV1.prefixId(signature.clerkUserId);
        const user = db.query.transitionUser
          .findFirst({ where: { id: { eq: userId } } })
          .sync();
        if (user === undefined) {
          return Effect.fail(
            new ZerospinError({
              code: 'transition-stable-user-missing',
              message: 'Stable transition frontend requires the web user',
            }),
          );
        }
        return Effect.succeed({ actorId: user.actorId, accountId });
      },
    },
  },
});

export const transitionUserAccountV3 = makeAccountController({
  name: 'user',
  version: '3.0.0',
  actorControllers: {
    shopper: transitionShopperActorV3,
  },
  models: {
    transitionUser: TransitionUserV1,
  },
  contracts: {
    createTransitionUser: createTransitionUserV1,
    renameTransitionUser: renameTransitionUserV3,
    setTransitionUserNote: setTransitionUserNoteV1,
  },
});

export const transitionSystemV3 = makeSystem({
  accountControllers: {
    user: transitionUserAccountV3,
  },
  serviceControllers: {
    app: transitionAppServiceV3,
  },
  name: 'shoppingTransitions',
  version: '3.0.0',
});
