import { defineCommand } from '@zerospin/core/contracts/Command';
import { makeContractVersion } from '@zerospin/core/contracts/makeVersion';
import { makeModel, makeModelVersion } from '@zerospin/core/models/makeModel';
import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';

export const SourceItem = makeModelVersion(
  makeModel({ name: 'sourceItem', abbreviation: 'sitm' }),
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
  defineCommand('createSourceItem'),
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
  defineCommand('updateSourceItemQuantity'),
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
  defineCommand('deleteSourceItem'),
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
