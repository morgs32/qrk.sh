import { primitives } from '@zerospin/schema';
import { assert, type Equals } from 'tsafe';

import { aggregates } from '../aggregate/index.ts';
import { contracts } from '../contracts/index.ts';
import { models } from '../models/index.ts';

import { makeFrontendController } from './makeFrontendController.ts';
import type { IAggregateFrontend } from './types.ts';

const item = models.makeModel({ name: 'item', abbreviation: 'itm' });
const itemV1 = models.makeVersion(item, {
  version: '1.0.0',
  attributes: { label: primitives.text() },
  indexes: [],
});
const itemV2 = models.makeVersion(item, {
  version: '2.0.0',
  attributes: { label: primitives.text() },
  indexes: [],
});
const inspect = contracts.makeCommand('inspect');
const inspectV1 = contracts.makeVersion(inspect, {
  version: '1.0.0',
  payload: {},
});
const inspectV2 = contracts.makeVersion(inspect, {
  version: '2.0.0',
  payload: {},
});
const shopperV1 = aggregates.makeVersion(
  aggregates.makeAggregate({ name: 'shopper' }),
  {
    version: '1.0.0',
    models: { item: itemV1 },
    contracts: { inspect: { contract: inspectV1 } },
    selections: {},
  },
);

const frontend = makeFrontendController({
  systemName: 'shopping',
  aggregateName: 'shopper',
  aggregateVersion: '1.0.0',
  name: 'web',
  models: { item: itemV1 },
  contracts: { inspect: { contract: inspectV1 } },
}) satisfies IAggregateFrontend<typeof shopperV1>;
assert<Equals<typeof frontend.systemName, 'shopping'>>();
assert<Equals<typeof frontend.name, 'web'>>();
assert<Equals<typeof frontend.aggregateVersion, '1.0.0'>>();
assert<Equals<typeof frontend.models.item, typeof itemV1>>();
assert<Equals<typeof frontend.contracts.inspect.contract, typeof inspectV1>>();

makeFrontendController({
  systemName: 'shopping',
  aggregateName: 'shopper',
  aggregateVersion: '1.0.0',
  name: 'empty',
  models: {},
  contracts: {},
}) satisfies IAggregateFrontend<typeof shopperV1>;

const wrongName = makeFrontendController({
  ...frontend,
  aggregateName: 'other',
});
// @ts-expect-error The aggregate name must match.
wrongName satisfies IAggregateFrontend<typeof shopperV1>;
const wrongVersion = makeFrontendController({
  ...frontend,
  aggregateVersion: '2.0.0',
});
// @ts-expect-error The aggregate version must match.
wrongVersion satisfies IAggregateFrontend<typeof shopperV1>;
const wrongModels = makeFrontendController({
  ...frontend,
  models: { item: itemV2 },
});
// @ts-expect-error The selected model must match the aggregate definition.
wrongModels satisfies IAggregateFrontend<typeof shopperV1>;
const wrongContracts = makeFrontendController({
  ...frontend,
  contracts: { inspect: { contract: inspectV2 } },
});
// @ts-expect-error The selected contract must match the aggregate definition.
wrongContracts satisfies IAggregateFrontend<typeof shopperV1>;

const other = models.makeVersion(
  models.makeModel({ name: 'other', abbreviation: 'oth' }),
  {
    version: '1.0.0',
    attributes: { label: primitives.text() },
    indexes: [],
  },
);
const extraModels = makeFrontendController({
  ...frontend,
  models: { item: itemV1, other },
});
// @ts-expect-error Extra entries cannot expose models outside the aggregate definition.
extraModels satisfies IAggregateFrontend<typeof shopperV1>;
