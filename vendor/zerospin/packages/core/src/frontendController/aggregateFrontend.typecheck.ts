import {
  main as authenticationFixtureFrontend,
  userAggregate as authenticationFixtureOwner,
} from '@zerospin/core/fixtures/system';
import { primitives } from '@zerospin/schema';
import { assert, type Equals } from 'tsafe';

import { makeAggregate } from '../aggregate/makeAggregate.ts';
import { makeAggregateVersion } from '../aggregate/makeVersion.ts';
import { defineCommand } from '../contracts/Command.ts';
import { makeContractVersion } from '../contracts/makeVersion.ts';
import { makeModel, makeModelVersion } from '../models/makeModel.ts';

import { makeFrontendController } from './makeFrontendController.ts';
import type { IAggregateFrontend } from './types.ts';

const item = makeModel({ name: 'item', abbreviation: 'itm' });
const itemV1 = makeModelVersion(item, {
  version: '1.0.0',
  attributes: { label: primitives.text() },
  indexes: [],
});
const itemV2 = makeModelVersion(item, {
  version: '2.0.0',
  attributes: { label: primitives.text() },
  indexes: [],
});
const inspect = defineCommand('inspect');
const inspectV1 = makeContractVersion(inspect, {
  version: '1.0.0',
  payload: {},
});
const inspectV2 = makeContractVersion(inspect, {
  version: '2.0.0',
  payload: {},
});
const shopperV1 = makeAggregateVersion(makeAggregate({ name: 'shopper' }), {
  authentication: authenticationFixtureOwner.authentication,
  version: '1.0.0',
  models: { item: itemV1 },
  contracts: { inspect: { contract: inspectV1 } },
  selections: {},
});

const frontend = makeFrontendController({
  authentication: authenticationFixtureFrontend.authentication,
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
  authentication: authenticationFixtureFrontend.authentication,
  systemName: 'shopping',
  aggregateName: 'shopper',
  aggregateVersion: '1.0.0',
  name: 'empty',
  models: {},
  contracts: {},
}) satisfies IAggregateFrontend<typeof shopperV1>;

const wrongName = makeFrontendController({
  systemName: frontend.systemName,
  aggregateVersion: frontend.aggregateVersion,
  name: frontend.name,
  authentication: frontend.authentication,
  models: frontend.models,
  contracts: frontend.contracts,
  aggregateName: 'other',
});
// @ts-expect-error The aggregate name must match.
wrongName satisfies IAggregateFrontend<typeof shopperV1>;
const wrongVersion = makeFrontendController({
  systemName: frontend.systemName,
  aggregateName: frontend.aggregateName,
  name: frontend.name,
  authentication: frontend.authentication,
  models: frontend.models,
  contracts: frontend.contracts,
  aggregateVersion: '2.0.0',
});
// @ts-expect-error The aggregate version must match.
wrongVersion satisfies IAggregateFrontend<typeof shopperV1>;
const wrongModels = makeFrontendController({
  systemName: frontend.systemName,
  aggregateName: frontend.aggregateName,
  aggregateVersion: frontend.aggregateVersion,
  name: frontend.name,
  authentication: frontend.authentication,
  contracts: frontend.contracts,
  models: { item: itemV2 },
});
// @ts-expect-error The selected model must match the aggregate definition.
wrongModels satisfies IAggregateFrontend<typeof shopperV1>;
const wrongContracts = makeFrontendController({
  systemName: frontend.systemName,
  aggregateName: frontend.aggregateName,
  aggregateVersion: frontend.aggregateVersion,
  name: frontend.name,
  authentication: frontend.authentication,
  models: frontend.models,
  contracts: { inspect: { contract: inspectV2 } },
});
// @ts-expect-error The selected contract must match the aggregate definition.
wrongContracts satisfies IAggregateFrontend<typeof shopperV1>;

const other = makeModelVersion(
  makeModel({ name: 'other', abbreviation: 'oth' }),
  {
    version: '1.0.0',
    attributes: { label: primitives.text() },
    indexes: [],
  },
);
const extraModels = makeFrontendController({
  systemName: frontend.systemName,
  aggregateName: frontend.aggregateName,
  aggregateVersion: frontend.aggregateVersion,
  name: frontend.name,
  authentication: frontend.authentication,
  contracts: frontend.contracts,
  models: { item: itemV1, other },
});
// @ts-expect-error Extra entries cannot expose models outside the aggregate definition.
extraModels satisfies IAggregateFrontend<typeof shopperV1>;
