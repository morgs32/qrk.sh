import { it } from '@effect/vitest';
import { userAggregate as authenticationFixtureOwner } from '@zerospin/core/fixtures/system';
import { CuidFactory, primitives } from '@zerospin/schema';
import { Effect, Layer, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { defineContract } from '../contracts/defineContract.ts';
import { makeContractVersion } from '../contracts/makeContractVersion.ts';
import { defineModel } from '../models/defineModel.ts';
import { makeModelVersion } from '../models/makeModelVersion.ts';
import { makeSelection } from '../models/makeSelection.ts';

import { defineAggregate } from './defineAggregate.ts';
import {
  makeAggregateVersion,
  upgradeAggregateVersion,
} from './makeAggregateVersion.ts';
import { requireVersion as requireAggregateVersion } from './requireVersion.ts';

const shopper = defineAggregate({ name: 'shopper' });
assert<Equals<typeof shopper.name, 'shopper'>>();

const ItemModel = defineModel({
  name: 'item',
  abbreviation: 'itm',
});

const Item = makeModelVersion(ItemModel, {
  attributes: { amount: primitives.integer() },
  indexes: [],
  version: '2.0.0',
});

const Note = makeModelVersion(
  defineModel({ name: 'note', abbreviation: 'nte' }),
  {
    attributes: { body: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);

const renameItem = makeContractVersion(defineContract('renameItem'), {
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

describe('makeAggregateVersion', () => {
  it('shares an identity between independent exact versions', () => {
    const first = makeAggregateVersion(shopper, {
      ...authenticationFixtureOwner.authentication,
      version: '1.0.0',
      models: {},
      contracts: {},
      selections: {},
    });
    const second = makeAggregateVersion(shopper, {
      ...authenticationFixtureOwner.authentication,
      version: '2.0.0',
      models: {},
      contracts: {},
      selections: {},
    });
    assert<Equals<typeof first.name, 'shopper'>>();
    assert<Equals<typeof first.version, '1.0.0'>>();
    expect(shopper).toEqual({ name: 'shopper', layer: Layer.empty });
    expect(first.layer).toBe(shopper.layer);
    expect(second.layer).toBe(shopper.layer);

    expect(first).not.toHaveProperty('upgrade');
    expect(first).not.toHaveProperty('makeCommand');
    expect(first).not.toHaveProperty('getVersion');
    expect(first).not.toHaveProperty('initializeGuards');
    expect(first).not.toHaveProperty('__initializeRequirements');
    expect(first).not.toBe(second);
    expect(first.name).toBe(second.name);
    expect(Effect.runSync(requireAggregateVersion(first, '1.0.0'))).toBe(first);
    expect(() =>
      Effect.runSync(requireAggregateVersion(first, '2.0.0')),
    ).toThrow('not "2.0.0"');
  });

  it('rejects invalid names and the superseded version name prop', () => {
    // @ts-expect-error Identity names must be strings.
    expect(() => defineAggregate({ name: 42 })).toThrow(Schema.SchemaError);
    expect(() =>
      makeAggregateVersion(shopper, {
        ...authenticationFixtureOwner.authentication,
        // @ts-expect-error The identity supplies the name.
        name: 'other',
        version: '1.0.0',
        models: {},
        contracts: {},
        selections: {},
      }),
    ).toThrow(Schema.SchemaError);
  });

  it('rejects structural copies without authored upgrade inputs', () => {
    const first = makeAggregateVersion(shopper, {
      ...authenticationFixtureOwner.authentication,
      version: '1.0.0',
      models: {},
      contracts: {},
      selections: {},
    });
    expect(() =>
      Reflect.apply(upgradeAggregateVersion, undefined, [
        { ...first },
        { version: '2.0.0' },
      ]),
    ).toThrow(Schema.SchemaError);
  });

  it('defaults omitted authentication to caller-selected /:aggregateId', async () => {
    const open = makeAggregateVersion(shopper, {
      version: '1.0.0',
      models: {},
      contracts: {},
      selections: {},
    });
    expect(open.authentication.pattern.source).toBe('/:aggregateId');
    expect(Object.keys(open.authentication.signatureSchema.fields)).toEqual([
      'aggregateId',
    ]);
    expect(Object.keys(open.authentication.authenticationSchema.fields)).toEqual(
      ['aggregateId'],
    );
    expect(Object.keys(open.authentication.selectionSchema.fields)).toEqual([
      'aggregateId',
    ]);
    expect(
      await Effect.runPromise(
        open.authentication
          .authenticate({
            signature: { aggregateId: 'acct_open' },
            executeCommand: () => {
              throw new Error('unused');
            },
          })
          .pipe(
            Effect.provide(AsyncLive),
            Effect.provideService(CuidFactory, () => Effect.succeed('unused')),
          ),
      ),
    ).toEqual({ aggregateId: 'acct_open' });
  });

  it('rejects removed mutation adapter configuration', () => {
    expect(() =>
      makeAggregateVersion(defineAggregate({ name: 'empty' }), {
        version: '1.0.0',
        ...authenticationFixtureOwner.authentication,
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
    const aggregate = makeAggregateVersion(defineAggregate({ name: 'list' }), {
      ...authenticationFixtureOwner.authentication,
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
      makeAggregateVersion(defineAggregate({ name: 'list' }), {
        ...authenticationFixtureOwner.authentication,
        version: '1.0.0',
        models: { item: { ...Item } as typeof Item },
        contracts: { renameItem: { contract: renameItem } },
        selections: {
          item: makeSelection({ model: Item, where: () => ({}) }),
        },
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      makeAggregateVersion(defineAggregate({ name: 'list' }), {
        ...authenticationFixtureOwner.authentication,
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
      makeAggregateVersion(defineAggregate({ name: 'list' }), {
        ...authenticationFixtureOwner.authentication,
        version: '1.0.0',
        models: { item: Item },
        contracts: {},
        selections: {},
      }),
    ).toThrow(/must contain exactly one selection for every model/);
    expect(() =>
      makeAggregateVersion(defineAggregate({ name: 'list' }), {
        ...authenticationFixtureOwner.authentication,
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
      defineContract(renameItem.commandName),
      {
        version: renameItem.version,
        payload: renameItem.payload,
        program: renameItem.program,
        guard,
      },
    );
    const aggregate = makeAggregateVersion(defineAggregate({ name: 'list' }), {
      ...authenticationFixtureOwner.authentication,
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
