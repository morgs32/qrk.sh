import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/makeContractVersion';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/makeModelVersion';
import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';

export const SourceItem = makeModelVersion(
  defineModel({ name: 'sourceItem', abbreviation: 'sitm' }),
  {
    attributes: {
      userId: primitives.foreignKey({ abbreviation: 'uid' }),
      quantity: primitives.integer(),
    },
    indexes: [],
    version: '1.0.0',
  },
);

export const createSourceItem = makeContractVersion(
  defineContract('createSourceItem'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: SourceItem.abbreviation }),
      userId: primitives.foreignKey({ abbreviation: 'uid' }),
      quantity: primitives.integer(),
    },
    models: { sourceItem: SourceItem },
    program: ({ payload, models }) =>
      Effect.all({
        created: models.sourceItem.create({
          resourceId: payload.id,
          attributes: {
            userId: payload.userId,
            quantity: payload.quantity,
          },
        }),
      }),
    version: '1.0.0',
  },
);

export const updateSourceItemQuantity = makeContractVersion(
  defineContract('updateSourceItemQuantity'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: SourceItem.abbreviation }),
      quantity: primitives.integer(),
    },
    models: { sourceItem: SourceItem },
    program: ({ payload, models }) =>
      Effect.all({
        updated: models.sourceItem.update({
          resourceId: payload.id,
          attributes: { quantity: payload.quantity },
        }),
      }),
    version: '1.0.0',
  },
);

export const deleteSourceItem = makeContractVersion(
  defineContract('deleteSourceItem'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: SourceItem.abbreviation }),
    },
    models: { sourceItem: SourceItem },
    program: ({ payload, models }) =>
      Effect.all({
        deleted: models.sourceItem.delete({
          resourceId: payload.id,
        }),
      }),
    version: '1.0.0',
  },
);
