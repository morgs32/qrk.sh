import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import { defineCommand } from '../contracts/Command.ts';
import {
  makeContractVersion,
  upgradeContractVersion,
} from '../contracts/makeVersion.ts';
import { makeCommand } from '../makeCommand.ts';
import {
  makeModel,
  makeModelVersion,
  upgradeModelVersion,
} from '../models/makeModel.ts';
import { makeSelection } from '../models/makeSelection.ts';
import { prefixId } from '../models/prefixId.ts';
import { makeService } from '../service/makeService.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';

import { makeAggregate } from './makeAggregate.ts';
import {
  makeAggregateVersion,
  upgradeAggregateVersion,
} from './makeVersion.ts';
import { requireVersion as requireAggregateVersion } from './requireVersion.ts';

const ItemModel = makeModel({ name: 'item', abbreviation: 'itm' });

const ItemV1 = makeModelVersion(ItemModel, {
  version: '1.0.0',
  attributes: { amount: primitives.integer() },
  indexes: [],
});
const ItemV2 = upgradeModelVersion(ItemV1, {
  version: '2.0.0',
  attributes: { amount: null, quantity: primitives.integer() },
});
const SetV1 = makeContractVersion(defineCommand('setQuantity'), {
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
const SetV2 = upgradeContractVersion(SetV1, {
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
const V1 = makeAggregateVersion(makeAggregate({ name: 'cart' }), {
  version: '1.0.0',
  models: { item: ItemV1 },
  contracts: { setQuantity: { contract: SetV1 } },
  selections: { item: makeSelection({ model: ItemV1, where: () => ({}) }) },
  services: { app: AppV1 },
});
const V2 = upgradeAggregateVersion(V1, {
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
    expect(await Effect.runPromise(requireAggregateVersion(V2, '2.0.0'))).toBe(
      V2,
    );
    await expect(
      Effect.runPromise(requireAggregateVersion(V2, '1.0.0')),
    ).rejects.toThrow('not "1.0.0"');
  });

  it('constructs commands with the replacement contract payload and version', async () => {
    const command = await Effect.runPromise(
      makeCommand(V2, {
        contractName: 'setQuantity',
        aggregateId: 'acct_test',
        systemName: 'shopping',
        payload: {
          id: prefixId(ItemV2, 'test'),
          quantity: 4,
        },
      }).pipe(Effect.provide(makePrefixedIncrementalIdFactory('upgrade'))),
    );
    assert<Equals<typeof command.aggregateName, 'cart'>>();
    assert<Equals<typeof command.systemName, 'shopping'>>();
    assert<Equals<typeof command.contractVersion, '2.0.0'>>();
    assert<Equals<typeof command.payload.quantity, number>>();
    expect(command.contractVersion).toBe('2.0.0');
    expect(command.payload).toEqual({ id: 'itm_test', quantity: 4 });
  });

  it('removes map entries explicitly and supports another upgrade', () => {
    const V3 = upgradeAggregateVersion(V2, {
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
    expect(upgradeAggregateVersion(V3, { version: '4.0.0' }).models).toEqual(
      {},
    );
  });

  it('revalidates merged definitions and rejects unknown removals', () => {
    expect(() =>
      upgradeAggregateVersion(V1, {
        version: '2.0.0',
        models: { item: null },
      }),
    ).toThrow();
    expect(() => upgradeAggregateVersion(V1, { version: 'invalid' })).toThrow(
      Schema.SchemaError,
    );
    expect(() =>
      upgradeAggregateVersion(V1, {
        version: '2.0.0',
        // @ts-expect-error Cannot remove an unknown model.
        models: { missing: null },
      }),
    ).toThrow('unknown models entry');
  });
});
