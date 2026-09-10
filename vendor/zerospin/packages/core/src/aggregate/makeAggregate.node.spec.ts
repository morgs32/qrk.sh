import { it } from '@effect/vitest';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { contracts } from '../contracts/index.ts';
import { models as modelDefinitions } from '../models/index.ts';
import { makeSelection } from '../models/makeSelection.ts';

import { aggregates } from './index.ts';

const ItemModel = modelDefinitions.makeModel({
  name: 'item',
  abbreviation: 'itm',
});

const Item = modelDefinitions.makeVersion(ItemModel, {
  attributes: { amount: primitives.integer() },
  indexes: [],
  version: '2.0.0',
});

const Note = modelDefinitions.makeVersion(
  modelDefinitions.makeModel({ name: 'note', abbreviation: 'nte' }),
  {
    attributes: { body: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);

const renameItem = contracts.makeVersion(contracts.makeCommand('renameItem'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: ItemModel.abbreviation }),
    amount: primitives.integer(),
  },
  models: { item: Item },
  program: ({ payload, models }) =>
    Effect.all({
      updated: models.item.update({
        resourceId: payload.id,
        attributes: { amount: payload.amount },
      }),
    }),
  version: '1.0.0',
});

describe('makeAggregate', () => {
  it('rejects removed mutation adapter configuration', () => {
    expect(() =>
      aggregates.makeVersion(aggregates.makeAggregate({ name: 'empty' }), {
        version: '1.0.0',
        models: {},
        contracts: {},
        selections: {},
        ...{ mutationAdapters: {} },
      }),
    ).toThrow(Schema.SchemaError);
  });

  it('snapshots authored records while preserving canonical nested leaves', () => {
    const models = { item: Item };
    const contracts = { renameItem: { contract: renameItem } };
    const selections = {
      item: makeSelection({ model: Item, where: () => ({}) }),
    };
    const aggregate = aggregates.makeVersion(
      aggregates.makeAggregate({ name: 'list' }),
      {
        version: '1.0.0',
        models,
        contracts,
        selections,
        authorize: () => Effect.void,
      },
    );

    expect(aggregate).toMatchObject({ name: 'list' });
    expect(aggregate.models).not.toBe(models);
    expect(aggregate.contracts).not.toBe(contracts);
    expect(aggregate.selections).not.toBe(selections);
    expect(aggregate.models.item).toBe(Item);
    expect(aggregate.contracts.renameItem.contract).toBe(renameItem);
    expect(aggregate.selections.item.model).toBe(Item);

    Object.assign(models, { extra: Item });
    Object.assign(contracts, { extra: { contract: renameItem } });
    Object.assign(selections, { extra: selections.item });
    const replacementWhere = () => ({ replaced: true });
    selections.item.where = replacementWhere;

    expect(aggregate.models).not.toHaveProperty('extra');
    expect(aggregate.contracts).not.toHaveProperty('extra');
    expect(aggregate.selections).not.toHaveProperty('extra');
    expect(aggregate.selections.item.where).not.toBe(replacementWhere);
  });

  it('rejects structural copies of canonical local leaves', () => {
    expect(() =>
      aggregates.makeVersion(aggregates.makeAggregate({ name: 'list' }), {
        version: '1.0.0',
        models: { item: { ...Item } as typeof Item },
        contracts: { renameItem: { contract: renameItem } },
        selections: {
          item: makeSelection({ model: Item, where: () => ({}) }),
        },
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      aggregates.makeVersion(aggregates.makeAggregate({ name: 'list' }), {
        version: '1.0.0',
        models: { item: Item },
        contracts: {
          renameItem: {
            contract: { ...renameItem } as typeof renameItem,
          },
        },
        selections: {
          item: makeSelection({ model: Item, where: () => ({}) }),
        },
      }),
    ).toThrow(Schema.SchemaError);
  });

  it('enforces selection identities locally', () => {
    expect(() =>
      aggregates.makeVersion(aggregates.makeAggregate({ name: 'list' }), {
        version: '1.0.0',
        models: { item: Item },
        contracts: {},
        selections: {},
      }),
    ).toThrow(/must contain exactly one selection for every model/);
    expect(() =>
      aggregates.makeVersion(aggregates.makeAggregate({ name: 'list' }), {
        version: '1.0.0',
        models: { item: Item },
        contracts: {},
        selections: {
          item: makeSelection({ model: Note, where: () => ({}) }),
        },
      }),
    ).toThrow(/must be the same object as models.item/);
  });

  it('preserves contract guards', () => {
    const guard = () => Effect.void;
    const guardedRenameItem = contracts.makeVersion(
      contracts.makeCommand(renameItem.commandName),
      {
        version: renameItem.version,
        payload: renameItem.payload,
        program: renameItem.program,
        guard,
      },
    );
    const aggregate = aggregates.makeVersion(
      aggregates.makeAggregate({ name: 'list' }),
      {
        version: '1.0.0',
        models: { item: Item },
        contracts: { renameItem: { contract: guardedRenameItem } },
        selections: {
          item: makeSelection({ model: Item, where: () => ({}) }),
        },
        authorize: () => Effect.void,
      },
    );

    expect(aggregate.contracts.renameItem.contract.guard).toBe(guard);
  });
});
