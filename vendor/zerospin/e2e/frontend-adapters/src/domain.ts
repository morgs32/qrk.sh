import { makeContract } from '@zerospin/core/contracts/makeContract';
import { makeModel } from '@zerospin/core/models/makeModel';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

export const SourceItem = makeModel(
  {
    abbreviation: 'sitm',
    modelName: 'sourceItem',
    attributes: {
      userId: primitives.opaqueId({ abbreviation: 'uid' }),
      quantity: primitives.integer(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

export const createSourceItem = makeContract({
  commandName: 'createSourceItem',
  payload: {
    id: SourceItem.primaryKey({ autogenerate: true }),
    userId: primitives.opaqueId({ abbreviation: 'uid' }),
    quantity: primitives.integer(),
  },
  mutations: Schema.Struct({
    created: SourceItem.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: SourceItem.create('1.0.0', {
        resourceId: payload.id,
        attributes: {
          userId: payload.userId,
          quantity: payload.quantity,
        },
      }),
    }),
  version: '1.0.0',
});

export const updateSourceItemQuantity = makeContract({
  commandName: 'updateSourceItemQuantity',
  payload: {
    id: SourceItem.primaryKey({ autogenerate: false }),
    quantity: primitives.integer(),
  },
  mutations: Schema.Struct({
    updated: SourceItem.updateMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      updated: SourceItem.update('1.0.0', {
        resourceId: payload.id,
        attributes: { quantity: payload.quantity },
      }),
    }),
  version: '1.0.0',
});

export const deleteSourceItem = makeContract({
  commandName: 'deleteSourceItem',
  payload: {
    id: SourceItem.primaryKey({ autogenerate: false }),
  },
  mutations: Schema.Struct({
    deleted: SourceItem.deleteMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      deleted: SourceItem.delete('1.0.0', {
        resourceId: payload.id,
      }),
    }),
  version: '1.0.0',
});
