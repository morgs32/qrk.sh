import {
  main as authenticationFixtureFrontend,
  userAggregate as authenticationFixtureOwner,
} from '@zerospin/core/fixtures/system';
import { Effect, Layer, Redacted } from 'effect';

import { makeAggregate } from '../aggregate/makeAggregate.ts';
import {
  makeAggregateVersion,
  upgradeAggregateVersion,
} from '../aggregate/makeVersion.ts';
import { defineCommand } from '../contracts/Command.ts';
import {
  makeContractVersion,
  upgradeContractVersion,
} from '../contracts/makeVersion.ts';
import { initializeGuards as initializeFrontendGuards } from '../frontendController/initializeGuards.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { makeService } from '../service/makeService.ts';
import { PublishableKey } from '../services/PublishableKey.ts';
import { ZerospinApiUrl } from '../services/ZerospinApiUrl.ts';
import { makeSystem } from '../system/makeSystem.ts';

const inspect = makeContractVersion(defineCommand('inspect'), {
  version: '1.0.0',
  payload: {},
  guard: () => Effect.asVoid(PublishableKey),
});
const identity = makeAggregate({ name: 'account' });
const aggregate = makeAggregateVersion(identity, {
  authentication: authenticationFixtureOwner.authentication,
  version: '1.0.0',
  models: {},
  contracts: { inspect: { contract: inspect } },
  selections: {},
});
const appLayer = Layer.succeed(PublishableKey, Redacted.make('app'));
makeSystem({
  name: 'test',

  // @ts-expect-error Application wiring must supply the aggregate guard requirement.
  aggregates: { account: [aggregate] },
});
makeSystem({
  name: 'test',

  layer: appLayer,
  aggregates: { account: [aggregate] },
});

const service = makeService({
  authentication: authenticationFixtureOwner.authentication,
  name: 'catalog',
  version: '1.0.0',
  models: {},
  contracts: { inspect },
});
makeSystem({
  name: 'test',

  aggregates: {},
  // @ts-expect-error Application wiring must supply service guards too.
  services: { catalog: [service] },
});
makeSystem({
  name: 'test',

  layer: appLayer,
  aggregates: {},
  services: { catalog: [service] },
});

const local = Layer.effect(
  PublishableKey,
  Effect.map(ZerospinApiUrl, Redacted.make),
);
const overridden = makeAggregateVersion(
  makeAggregate({ name: 'account', layer: local }),
  {
    authentication: authenticationFixtureOwner.authentication,
    version: '1.0.0',
    models: {},
    contracts: { inspect: { contract: inspect } },
    selections: {},
  },
);
makeSystem({
  name: 'test',

  // @ts-expect-error The local layer still needs ZerospinApiUrl.
  layer: appLayer,
  // @ts-expect-error This owner requires the missing local-layer input too.
  aggregates: { account: [overridden] },
});
makeSystem({
  name: 'test',

  layer: Layer.succeed(ZerospinApiUrl, 'https://test.invalid'),
  aggregates: { account: [overridden] },
});

const next = upgradeAggregateVersion(aggregate, {
  version: '2.0.0',
  contracts: { inspect: null },
});
makeSystem({
  name: 'test',

  // @ts-expect-error The older registered version still requires PublishableKey.
  aggregates: { account: [aggregate, next] },
});
makeSystem({
  name: 'test',

  aggregates: { account: [next] },
});
makeAggregateVersion(identity, {
  authentication: authenticationFixtureOwner.authentication,
  version: '1.0.0',
  models: {},
  contracts: {},
  selections: {},
  // @ts-expect-error A version cannot replace its aggregate's layer.
  layer: Layer.empty,
});
// @ts-expect-error Upgrades retain their aggregate's layer.
upgradeAggregateVersion(aggregate, { version: '2.0.0', layer: Layer.empty });

const frontend = makeFrontendController({
  authentication: authenticationFixtureFrontend.authentication,
  systemName: 'test',
  aggregateName: 'account',
  aggregateVersion: '1.0.0',
  name: 'web',
  models: {},
  contracts: { inspect: { contract: inspect } },
  layer: local,
});
// @ts-expect-error Initializing local services requires their application inputs.
Effect.runPromise(Effect.scoped(initializeFrontendGuards(frontend)));
Effect.runPromise(
  initializeFrontendGuards(frontend).pipe(
    Effect.scoped,
    Effect.provide(Layer.succeed(ZerospinApiUrl, 'https://test.invalid')),
  ),
);

const latest = upgradeContractVersion(inspect, {
  version: '2.0.0',
  payload: {},
  guard: () => Effect.void,
  up: () => Effect.succeed({}),
  program: () => Effect.succeed({}),
});
const currentOnly = makeService({
  authentication: authenticationFixtureOwner.authentication,
  name: 'catalog',
  version: '2.0.0',
  models: {},
  contracts: { inspect: latest },
});
makeSystem({
  name: 'test',

  aggregates: {},
  services: { catalog: [currentOnly] },
});
const previous = makeService({
  authentication: authenticationFixtureOwner.authentication,
  name: 'catalog',
  version: '1.0.0',
  models: {},
  contracts: { inspect },
});
makeSystem({
  name: 'test',

  aggregates: {},
  // @ts-expect-error Explicitly registered older service guards still need PublishableKey.
  services: { catalog: [previous, currentOnly] },
});
makeSystem({
  name: 'test',

  layer: appLayer,
  aggregates: {},
  services: { catalog: [previous, currentOnly] },
});

const localService = makeService({
  authentication: authenticationFixtureOwner.authentication,
  name: 'catalog',
  version: '1.0.0',
  models: {},
  contracts: { inspect },
  layer: Layer.succeed(PublishableKey, Redacted.make('local')),
});
makeSystem({
  name: 'test',

  aggregates: {},
  services: { catalog: [localService] },
});
