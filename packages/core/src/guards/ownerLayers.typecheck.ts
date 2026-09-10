import { Effect, Layer, Redacted } from 'effect';

import { aggregates } from '../aggregate/index.ts';
import { contracts } from '../contracts/index.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { makeService } from '../service/makeService.ts';
import { PublishableKey } from '../services/PublishableKey.ts';
import { ZerospinApiUrl } from '../services/ZerospinApiUrl.ts';
import { makeSystem } from '../system/makeSystem.ts';

const inspect = contracts.makeVersion(contracts.makeCommand('inspect'), {
  version: '1.0.0',
  payload: {},
  guard: () => Effect.asVoid(PublishableKey),
});
const identity = aggregates.makeAggregate({ name: 'account' });
const aggregate = aggregates.makeVersion(identity, {
  version: '1.0.0',
  models: {},
  contracts: { inspect: { contract: inspect } },
  selections: {},
});
const appLayer = Layer.succeed(PublishableKey, Redacted.make('app'));
makeSystem({
  name: 'test',
  authentication: [],
  // @ts-expect-error Application wiring must supply the aggregate guard requirement.
  aggregates: { account: [aggregate] },
});
makeSystem({
  name: 'test',
  authentication: [],
  layer: appLayer,
  aggregates: { account: [aggregate] },
});

const service = makeService({
  name: 'catalog',
  version: '1.0.0',
  models: {},
  contracts: { inspect },
});
makeSystem({
  name: 'test',
  authentication: [],
  aggregates: {},
  // @ts-expect-error Application wiring must supply service guards too.
  services: { catalog: [service] },
});
makeSystem({
  name: 'test',
  authentication: [],
  layer: appLayer,
  aggregates: {},
  services: { catalog: [service] },
});

const local = Layer.effect(
  PublishableKey,
  Effect.map(ZerospinApiUrl, Redacted.make),
);
const overridden = aggregates.makeVersion(
  aggregates.makeAggregate({ name: 'account', layer: local }),
  {
    version: '1.0.0',
    models: {},
    contracts: { inspect: { contract: inspect } },
    selections: {},
  },
);
makeSystem({
  name: 'test',
  authentication: [],
  // @ts-expect-error The local layer still needs ZerospinApiUrl.
  layer: appLayer,
  // @ts-expect-error This owner requires the missing local-layer input too.
  aggregates: { account: [overridden] },
});
makeSystem({
  name: 'test',
  authentication: [],
  layer: Layer.succeed(ZerospinApiUrl, 'https://test.invalid'),
  aggregates: { account: [overridden] },
});

const next = aggregates.upgradeVersion(aggregate, {
  version: '2.0.0',
  contracts: { inspect: null },
});
makeSystem({
  name: 'test',
  authentication: [],
  // @ts-expect-error The older registered version still requires PublishableKey.
  aggregates: { account: [aggregate, next] },
});
makeSystem({
  name: 'test',
  authentication: [],
  aggregates: { account: [next] },
});
aggregates.makeVersion(identity, {
  version: '1.0.0',
  models: {},
  contracts: {},
  selections: {},
  // @ts-expect-error A version cannot replace its aggregate's layer.
  layer: Layer.empty,
});
// @ts-expect-error Upgrades retain their aggregate's layer.
aggregates.upgradeVersion(aggregate, { version: '2.0.0', layer: Layer.empty });

const frontend = makeFrontendController({
  systemName: 'test',
  aggregateName: 'account',
  aggregateVersion: '1.0.0',
  name: 'web',
  models: {},
  contracts: { inspect: { contract: inspect } },
  layer: local,
});
// @ts-expect-error Initializing local services requires their application inputs.
Effect.runPromise(Effect.scoped(frontend.initializeGuards));
Effect.runPromise(
  frontend.initializeGuards.pipe(
    Effect.scoped,
    Effect.provide(Layer.succeed(ZerospinApiUrl, 'https://test.invalid')),
  ),
);

const latest = contracts.upgradeVersion(inspect, {
  version: '2.0.0',
  payload: {},
  guard: () => Effect.void,
  up: () => Effect.succeed({}),
  program: () => Effect.succeed({}),
});
const currentOnly = makeService({
  name: 'catalog',
  version: '2.0.0',
  models: {},
  contracts: { inspect: latest },
});
makeSystem({
  name: 'test',
  authentication: [],
  aggregates: {},
  services: { catalog: [currentOnly] },
});
const historical = makeService({
  name: 'catalog',
  version: '2.0.0',
  models: {},
  contracts: { inspect: latest },
  historicalDefinitions: [
    { version: '1.0.0', models: {}, contracts: { inspect: '1.0.0' } },
  ],
});
makeSystem({
  name: 'test',
  authentication: [],
  aggregates: {},
  // @ts-expect-error Executable historical service guards still need PublishableKey.
  services: { catalog: [historical] },
});
makeSystem({
  name: 'test',
  authentication: [],
  layer: appLayer,
  aggregates: {},
  services: { catalog: [historical] },
});

const localService = makeService({
  name: 'catalog',
  version: '1.0.0',
  models: {},
  contracts: { inspect },
  layer: Layer.succeed(PublishableKey, Redacted.make('local')),
});
makeSystem({
  name: 'test',
  authentication: [],
  aggregates: {},
  services: { catalog: [localService] },
});
