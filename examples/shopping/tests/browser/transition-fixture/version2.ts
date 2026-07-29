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
  createTransitionProductV1,
  createTransitionUserV1,
  setTransitionUserNoteV1,
  TransitionProductV1,
  transitionStableFrontendV1,
  TransitionUserV1,
} from './version1Frontend';
import {
  renameTransitionUserV2,
  transitionCatalogFrontendV2,
  transitionShopperFrontendV2,
} from './version2Frontend';

export const transitionCatalogViewerActorV2 = makeServiceActorController({
  name: 'catalogViewer',
  version: '2.0.0',
  models: {
    transitionProduct: TransitionProductV1,
  },
  frontends: {
    catalog: {
      frontendController: transitionCatalogFrontendV2,
      authenticate: ({ db, signature }) => {
        db.query.transitionProduct.findMany().sync();
        return Effect.succeed(prefixActorId(signature.viewerId));
      },
    },
  },
});

export const transitionAppServiceV2 = makeServiceController({
  name: 'app',
  version: '2.0.0',
  models: {
    transitionProduct: TransitionProductV1,
  },
  contracts: {
    createTransitionProduct: createTransitionProductV1,
  },
  actorControllers: {
    catalogViewer: transitionCatalogViewerActorV2,
  },
  queries: {},
});

export const transitionShopperActorV2 = makeActorController({
  name: 'shopper',
  version: '2.0.0',
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
      frontendController: transitionShopperFrontendV2,
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

export const transitionUserAccountV2 = makeAccountController({
  name: 'user',
  version: '2.0.0',
  actorControllers: {
    shopper: transitionShopperActorV2,
  },
  models: {
    transitionUser: TransitionUserV1,
  },
  contracts: {
    createTransitionUser: createTransitionUserV1,
    renameTransitionUser: renameTransitionUserV2,
    setTransitionUserNote: setTransitionUserNoteV1,
  },
});

export const transitionSystemV2 = makeSystem({
  accountControllers: {
    user: transitionUserAccountV2,
  },
  serviceControllers: {
    app: transitionAppServiceV2,
  },
  name: 'shoppingTransitions',
  version: '2.0.0',
});
