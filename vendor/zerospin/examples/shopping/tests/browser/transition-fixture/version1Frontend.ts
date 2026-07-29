import { makeContract } from '@zerospin/core/contracts/makeContract';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeModel } from '@zerospin/core/models/makeModel';
import { makeServiceModel } from '@zerospin/core/models/makeServiceModel';
import { primitives } from '@zerospin/core/models/primitives';
import { makeServiceFrontendController } from '@zerospin/core/serviceFrontendController/makeServiceFrontendController';
import { Effect, Schema } from 'effect';

export const TransitionUserV1 = makeModel(
  {
    abbreviation: 'tur',
    modelName: 'transitionUser',
    attributes: {
      actorId: primitives.opaqueId({ abbreviation: 'actr', unique: true }),
      name: primitives.text({ nullable: true }),
      note: primitives.text({ nullable: true }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

export const TransitionProductV1 = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'tpr',
    modelName: 'transitionProduct',
    attributes: {
      name: primitives.text(),
    },
    indexes: [
      {
        name: 'transitionProduct_name_idx',
        columns: ['name'],
      },
    ],
    version: '1.0.0',
  },
  [],
);

export const createTransitionUserV1 = makeContract({
  commandName: 'createTransitionUser',
  payload: {
    id: TransitionUserV1.primaryKey({ autogenerate: false }),
    actorId: primitives.opaqueId({ abbreviation: 'actr' }),
  },
  mutations: Schema.Struct({
    created: TransitionUserV1.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: TransitionUserV1.create('1.0.0', {
        resourceId: payload.id,
        attributes: {
          actorId: payload.actorId,
          name: null,
          note: null,
        },
      }),
    }),
  version: '1.0.0',
});

export const renameTransitionUserV1 = makeContract({
  commandName: 'renameTransitionUser',
  payload: {
    id: TransitionUserV1.primaryKey({ autogenerate: false }),
    name: primitives.text(),
  },
  mutations: Schema.Struct({
    updated: TransitionUserV1.updateMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      updated: TransitionUserV1.update('1.0.0', {
        resourceId: payload.id,
        attributes: { name: payload.name },
      }),
    }),
  version: '1.0.0',
});

export const setTransitionUserNoteV1 = makeContract({
  commandName: 'setTransitionUserNote',
  payload: {
    id: TransitionUserV1.primaryKey({ autogenerate: false }),
    note: primitives.text(),
  },
  mutations: Schema.Struct({
    updated: TransitionUserV1.updateMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      updated: TransitionUserV1.update('1.0.0', {
        resourceId: payload.id,
        attributes: { note: payload.note },
      }),
    }),
  version: '1.0.0',
});

export const createTransitionProductV1 = makeContract({
  commandName: 'createTransitionProduct',
  payload: {
    id: TransitionProductV1.primaryKey({ autogenerate: true }),
    name: primitives.text(),
  },
  mutations: Schema.Struct({
    created: TransitionProductV1.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: TransitionProductV1.create('1.0.0', {
        resourceId: payload.id,
        attributes: { name: payload.name },
      }),
    }),
  version: '1.0.0',
});

export const transitionShopperFrontendV1 = makeFrontendController({
  systemName: 'shoppingTransitions',
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '1.0.0',
  models: {
    transitionUser: TransitionUserV1,
  },
  contracts: {
    renameTransitionUser: renameTransitionUserV1,
  },
  signature: Schema.Struct({
    clerkUserId: Schema.String,
  }),
});

export const transitionStableFrontendV1 = makeFrontendController({
  systemName: 'shoppingTransitions',
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'stable',
  version: '1.0.0',
  models: {
    transitionUser: TransitionUserV1,
  },
  contracts: {
    setTransitionUserNote: setTransitionUserNoteV1,
  },
  signature: Schema.Struct({
    clerkUserId: Schema.String,
  }),
});

export const transitionCatalogFrontendV1 = makeServiceFrontendController({
  systemName: 'shoppingTransitions',
  serviceName: 'app',
  actorName: 'catalogViewer',
  frontendName: 'catalog',
  version: '1.0.0',
  models: {
    transitionProduct: TransitionProductV1,
  },
  signature: Schema.Struct({
    viewerId: Schema.String,
  }),
});
