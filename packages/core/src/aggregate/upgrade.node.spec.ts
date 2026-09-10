import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import { contracts } from '../contracts/index.ts';
import { models } from '../models/index.ts';
import { makeSelection } from '../models/makeSelection.ts';
import { makeService } from '../service/makeService.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';

import { aggregates } from './index.ts';

const ItemModel = models.makeModel({ name: 'item', abbreviation: 'itm' });

const ItemV1 = models.makeVersion(ItemModel, {
  version: '1.0.0',
  attributes: { amount: primitives.integer() },
  indexes: [],
});
const ItemV2 = models.upgradeVersion(ItemV1, {
  version: '2.0.0',
  attributes: { amount: null, quantity: primitives.integer() },
});
const SetV1 = contracts.makeVersion(contracts.makeCommand('setQuantity'), {
  version: '1.0.0',
  payload: {
    id: primitives.foreignKey({ abbreviation: ItemModel.abbreviation }),
    amount: primitives.integer(),
  },
  models: { item: ItemV1 },
  program: ({ payload, models }) =>
    models.item.update({
      resourceId: payload.id,
      attributes: { amount: payload.amount },
    }),
});
const SetV2 = contracts.upgradeVersion(SetV1, {
  up: ({ payload }) =>
    Effect.succeed({ id: payload.id, quantity: payload.amount }),
  version: '2.0.0',
  payload: { amount: null, quantity: primitives.integer() },
  models: { item: ItemV2 },
  program: ({ payload, models }) =>
    models.item.update({
      resourceId: payload.id,
      attributes: { quantity: payload.quantity },
    }),
});
const AppV1 = makeService({
  name: 'app',
  version: '1.0.0',
  models: {},
  contracts: {},
  frontends: {},
});
const V1 = aggregates.makeVersion(aggregates.makeAggregate({ name: 'cart' }), {
  version: '1.0.0',
  models: { item: ItemV1 },
  contracts: { setQuantity: { contract: SetV1 } },
  selections: { item: makeSelection({ model: ItemV1, where: () => ({}) }) },
  services: { app: AppV1 },
});
const V2 = aggregates.upgradeVersion(V1, {
  version: '2.0.0',
  models: { item: ItemV2 },
  contracts: { setQuantity: { contract: SetV2 } },
  selections: { item: makeSelection({ model: ItemV2, where: () => ({}) }) },
});
assert<Equals<typeof V2.models.item, typeof ItemV2>>();
assert<Equals<typeof V2.contracts.setQuantity.contract, typeof SetV2>>();
assert<Equals<typeof V2.name, 'cart'>>();
assert<Equals<typeof V2.version, '2.0.0'>>();

describe('aggregate upgrades', () => {
  it('inherits unchanged bindings and keeps versions independent', async () => {
    expect(V1.models.item).toBe(ItemV1);
    expect(V2.models.item).toBe(ItemV2);
    expect(V2.contracts.setQuantity.contract).toBe(SetV2);
    expect(V2.selections.item.model).toBe(ItemV2);
    expect(V2.services).toEqual({ app: '1.0.0' });

    expect(V2).not.toHaveProperty('historicalDefinitions');
    expect(await Effect.runPromise(V2.getVersion('2.0.0'))).toBe(V2);
    await expect(Effect.runPromise(V2.getVersion('1.0.0'))).rejects.toThrow(
      'not "1.0.0"',
    );
  });

  it('constructs commands with the replacement contract payload and version', async () => {
    const command = await Effect.runPromise(
      V2.makeCommand({
        contractName: 'setQuantity',
        aggregateId: 'acct_test',
        systemName: 'shopping',
        payload: { id: ItemV2.prefixId('test'), quantity: 4 },
      }).pipe(Effect.provide(makePrefixedIncrementalIdFactory('upgrade'))),
    );
    expect(command.contractVersion).toBe('2.0.0');
    expect(command.payload).toEqual({ id: 'itm_test', quantity: 4 });
  });

  it('removes map entries explicitly and supports another upgrade', () => {
    const V3 = aggregates.upgradeVersion(V2, {
      version: '3.0.0',
      models: { item: null },
      contracts: { setQuantity: null },
      selections: { item: null },
      services: { app: null },
    });
    assert<Equals<keyof typeof V3.models, never>>();
    assert<Equals<keyof typeof V3.contracts, never>>();
    expect(V3.models).toEqual({});
    expect(V3.contracts).toEqual({});
    expect(V3.services).toEqual({});
    expect(aggregates.upgradeVersion(V3, { version: '4.0.0' }).models).toEqual(
      {},
    );
  });

  it('revalidates merged definitions and rejects unknown removals', () => {
    expect(() =>
      aggregates.upgradeVersion(V1, {
        version: '2.0.0',
        models: { item: null },
      }),
    ).toThrow();
    expect(() => aggregates.upgradeVersion(V1, { version: 'invalid' })).toThrow(
      Schema.SchemaError,
    );
    expect(() =>
      aggregates.upgradeVersion(V1, {
        version: '2.0.0',
        // @ts-expect-error Cannot remove an unknown model.
        models: { missing: null },
      }),
    ).toThrow('unknown models entry');
  });
});
