import { makeContract } from '@zerospin/core/contracts/makeContract';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeServiceModel } from '@zerospin/core/models/makeServiceModel';
import { primitives } from '@zerospin/core/models/primitives';
import { makeServiceFrontendController } from '@zerospin/core/serviceFrontendController/makeServiceFrontendController';
import { Effect, Schema } from 'effect';

import { TransitionUserV1 } from './version1Frontend';

export const TransitionProductV3 = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'tpr',
    modelName: 'transitionProduct',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

export const renameTransitionUserV3 = makeContract(
  {
    commandName: 'renameTransitionUser',
    payload: {
      id: TransitionUserV1.primaryKey({ autogenerate: false }),
      title: primitives.text(),
    },
    mutations: Schema.Struct({
      updated: TransitionUserV1.updateMutation('1.0.0'),
    }),
    program: ({ payload }) =>
      Effect.all({
        updated: TransitionUserV1.update('1.0.0', {
          resourceId: payload.id,
          attributes: { name: `v3:${payload.title}` },
        }),
      }),
    version: '3.0.0',
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
        Effect.succeed({ id: payload.id, title: `from-v1:${payload.name}` }),
    },
    {
      commandName: 'renameTransitionUser',
      version: '2.0.0',
      payload: {
        id: TransitionUserV1.primaryKey({ autogenerate: false }),
        label: primitives.text(),
      },
      adaptPayload: ({ payload }) =>
        Effect.succeed({ id: payload.id, title: `from-v2:${payload.label}` }),
    },
  ],
);

export const createTransitionProductV3 = makeContract({
  commandName: 'createTransitionProduct',
  payload: {
    id: TransitionProductV3.primaryKey({ autogenerate: true }),
    name: primitives.text(),
  },
  mutations: Schema.Struct({
    created: TransitionProductV3.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: TransitionProductV3.create('1.0.0', {
        resourceId: payload.id,
        attributes: { name: payload.name },
      }),
    }),
  version: '1.0.0',
});

export const transitionShopperFrontendV3 = makeFrontendController({
  systemName: 'shoppingTransitions',
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '3.0.0',
  models: {
    transitionUser: TransitionUserV1,
  },
  contracts: {
    renameTransitionUser: renameTransitionUserV3,
  },
  signature: Schema.Struct({
    clerkUserId: Schema.String,
  }),
});

export const transitionCatalogFrontendV3 = makeServiceFrontendController({
  systemName: 'shoppingTransitions',
  serviceName: 'app',
  actorName: 'catalogViewer',
  frontendName: 'catalog',
  version: '3.0.0',
  models: {
    transitionProduct: TransitionProductV3,
  },
  signature: Schema.Struct({
    viewerId: Schema.String,
  }),
});
