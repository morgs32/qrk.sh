import { makeContract } from '@zerospin/core/contracts/makeContract';
import { makeModel } from '@zerospin/core/models/makeModel';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

export const ProjectedItem = makeModel(
  {
    abbreviation: 'sitm',
    modelName: 'projectedItem',
    attributes: {
      quantity: primitives.integer(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

export const updateProjectedItemQuantity = makeContract({
  commandName: 'updateSourceItemQuantity',
  payload: {
    id: ProjectedItem.primaryKey({ autogenerate: false }),
    quantity: primitives.integer(),
  },
  mutations: Schema.Struct({
    updated: ProjectedItem.updateMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      updated: ProjectedItem.update('1.0.0', {
        resourceId: payload.id,
        attributes: { quantity: payload.quantity },
      }),
    }),
  version: '1.0.0',
});
