import { it } from '@effect/vitest';
import { userAggregate as authenticationFixtureOwner } from '@zerospin/core/fixtures/system';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { defineCommand } from '../contracts/Command.ts';
import { makeContractVersion } from '../contracts/makeVersion.ts';
import { makeModel, makeModelVersion } from '../models/makeModel.ts';
import { makeSelection } from '../models/makeSelection.ts';

import { makeAggregate } from './makeAggregate.ts';
import { makeAggregateVersion } from './makeVersion.ts';

const ItemModel = makeModel({
  name: 'item',
  abbreviation: 'itm',
});

const Item = makeModelVersion(ItemModel, {
  attributes: { amount: primitives.integer() },
  indexes: [],
  version: '2.0.0',
});

const Note = makeModelVersion(
  makeModel({ name: 'note', abbreviation: 'nte' }),
  {
    attributes: { body: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);

const renameItem = makeContractVersion(defineCommand('renameItem'), {
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
      makeAggregateVersion(makeAggregate({ name: 'empty' }), {
        version: '1.0.0',
        authentication: authenticationFixtureOwner.authentication,
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
    const aggregate = makeAggregateVersion(makeAggregate({ name: 'list' }), {
      authentication: authenticationFixtureOwner.authentication,
      version: '1.0.0',
      models,
      contracts,
      selections,
      authorize: () => Effect.void,
    });

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
      makeAggregateVersion(makeAggregate({ name: 'list' }), {
        authentication: authenticationFixtureOwner.authentication,
        version: '1.0.0',
        models: { item: { ...Item } as typeof Item },
        contracts: { renameItem: { contract: renameItem } },
        selections: {
          item: makeSelection({ model: Item, where: () => ({}) }),
        },
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      makeAggregateVersion(makeAggregate({ name: 'list' }), {
        authentication: authenticationFixtureOwner.authentication,
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
      makeAggregateVersion(makeAggregate({ name: 'list' }), {
        authentication: authenticationFixtureOwner.authentication,
        version: '1.0.0',
        models: { item: Item },
        contracts: {},
        selections: {},
      }),
    ).toThrow(/must contain exactly one selection for every model/);
    expect(() =>
      makeAggregateVersion(makeAggregate({ name: 'list' }), {
        authentication: authenticationFixtureOwner.authentication,
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
    const guardedRenameItem = makeContractVersion(
      defineCommand(renameItem.commandName),
      {
        version: renameItem.version,
        payload: renameItem.payload,
        program: renameItem.program,
        guard,
      },
    );
    const aggregate = makeAggregateVersion(makeAggregate({ name: 'list' }), {
      authentication: authenticationFixtureOwner.authentication,
      version: '1.0.0',
      models: { item: Item },
      contracts: { renameItem: { contract: guardedRenameItem } },
      selections: {
        item: makeSelection({ model: Item, where: () => ({}) }),
      },
      authorize: () => Effect.void,
    });

    expect(aggregate.contracts.renameItem.contract.guard).toBe(guard);
  });
});
