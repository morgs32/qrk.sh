import { makeContract } from '@zerospin/core/contracts/makeContract';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { primitives } from '@zerospin/core/models/primitives';
import { makeServiceFrontendController } from '@zerospin/core/serviceFrontendController/makeServiceFrontendController';
import { Effect, Schema } from 'effect';

import {
  TransitionProductV1,
  TransitionUserV1,
} from './version1Frontend';

export const renameTransitionUserV2 = makeContract(
  {
    commandName: 'renameTransitionUser',
    payload: {
      id: TransitionUserV1.primaryKey({ autogenerate: false }),
      label: primitives.text(),
    },
    mutations: Schema.Struct({
      updated: TransitionUserV1.updateMutation('1.0.0'),
    }),
    program: ({ payload }) =>
      Effect.all({
        updated: TransitionUserV1.update('1.0.0', {
          resourceId: payload.id,
          attributes: { name: `v2:${payload.label}` },
        }),
      }),
    version: '2.0.0',
  },
  [
    {
      commandName: 'renameTransitionUser',
      version: '1.0.0',
      payload: {
        id: TransitionUserV1.primaryKey({ autogenerate: false }),
        name: primitives.text(),
      },
      adaptPayload: ({ payload }) =>
        Effect.succeed({ id: payload.id, label: payload.name }),
    },
  ],
);

export const transitionShopperFrontendV2 = makeFrontendController({
  systemName: 'shoppingTransitions',
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '2.0.0',
  models: {
    transitionUser: TransitionUserV1,
  },
  contracts: {
    renameTransitionUser: renameTransitionUserV2,
  },
  signature: Schema.Struct({
    clerkUserId: Schema.String,
  }),
});

export const transitionCatalogFrontendV2 = makeServiceFrontendController({
  systemName: 'shoppingTransitions',
  serviceName: 'app',
  actorName: 'catalogViewer',
  frontendName: 'catalog',
  version: '2.0.0',
  models: {
    transitionProduct: TransitionProductV1,
  },
  signature: Schema.Struct({
    viewerId: Schema.String,
  }),
});
