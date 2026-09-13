import { makeAggregate } from '@zerospin/core/aggregate/makeAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/makeVersion';
import {
  Item,
  List,
  main,
  User,
  userAggregate,
} from '@zerospin/core/fixtures/system';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeService } from '@zerospin/core/service/makeService';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import type { IAnyError } from '@zerospin/error';
import { type Layer } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeZerospinApp } from './makeZerospinApp';

declare const layer: Layer.Layer<PublishableKey | ZerospinApiUrl, IAnyError>;
const userV1 = makeAggregateVersion(makeAggregate({ name: 'user' }), {
  authentication: userAggregate.authentication,
  version: '1.0.0',
  models: main.models,
  contracts: main.contracts,
  selections: {},
});
const userV2 = makeAggregateVersion(makeAggregate({ name: 'user' }), {
  authentication: userAggregate.authentication,
  version: '2.0.0',
  models: { user: User },
  contracts: {},
  selections: {},
});
const catalog = makeService({
  authentication: userAggregate.authentication,
  name: 'catalog',
  version: '1.0.0',
  models: { user: User, list: List, item: Item },
  contracts: {},
});
const catalogV2 = makeService({
  authentication: userAggregate.authentication,
  name: 'catalog',
  version: '2.0.0',
  models: { user: User },
  contracts: {},
});
const system = makeSystem({
  name: 'system-worker',

  aggregates: { user: [userV1, userV2] },
  services: { catalog: [catalog, catalogV2] },
});
const emptySystem = makeSystem({
  name: 'system-worker',

  aggregates: {},
  services: {},
});
const app = makeZerospinApp<typeof system>({
  systemName: 'system-worker',
  layer,
});
const emptyApp = makeZerospinApp<typeof emptySystem>({
  systemName: 'system-worker',
  layer,
});
const Main = app.makeFrontend(main);
assert<Equals<typeof app.systemName, 'system-worker'>>();
assert<Equals<typeof Main.frontend, typeof main>>();
assert<Equals<typeof Main.models, typeof main.models>>();
const subset = makeFrontendController({
  authentication: main.authentication,
  systemName: 'system-worker',
  name: 'subset',
  aggregateName: 'user',
  aggregateVersion: '1.0.0',
  models: { user: User, list: List },
  contracts: { createList: main.contracts.createList },
});
const second = makeFrontendController({
  authentication: main.authentication,
  systemName: 'system-worker',
  name: 'second',
  aggregateName: 'user',
  aggregateVersion: '2.0.0',
  models: { user: User },
  contracts: {},
});
const products = makeFrontendController({
  authentication: main.authentication,
  systemName: 'system-worker',
  name: 'products',
  serviceName: 'catalog',
  serviceVersion: '1.0.0',
  models: catalog.models,
});
const productsV2 = makeFrontendController({
  authentication: main.authentication,
  systemName: 'system-worker',
  name: 'productsV2',
  serviceName: 'catalog',
  serviceVersion: '2.0.0',
  models: { user: User },
});
app.makeFrontend(subset);
app.makeFrontend(second);
app.makeFrontend(products);
app.makeFrontend(productsV2);
app.makeFrontend({ ...products, models: { user: User } });
// @ts-expect-error Empty registries cannot admit aggregate owners.
emptyApp.makeFrontend(main);
// @ts-expect-error Empty registries cannot admit service owners.
emptyApp.makeFrontend(products);
makeZerospinApp<typeof system>({
  // @ts-expect-error The app must match the system name.
  systemName: 'other',
  layer,
});
// @ts-expect-error Unknown aggregate owner.
app.makeFrontend({ ...main, aggregateName: 'missing' });
// @ts-expect-error Unknown service owner.
app.makeFrontend({ ...products, serviceName: 'missing' });
// @ts-expect-error Unknown aggregate version.
app.makeFrontend({ ...main, aggregateVersion: '3.0.0' });
// @ts-expect-error Unknown service version.
app.makeFrontend({ ...products, serviceVersion: '3.0.0' });
// @ts-expect-error Frontend system must match.
app.makeFrontend({ ...main, systemName: 'other' });
// @ts-expect-error A model under an existing key must be compatible.
app.makeFrontend({ ...main, models: { user: Item } });
app.makeFrontend({
  ...main,
  // @ts-expect-error Contract names and definitions must agree.
  contracts: { createList: main.contracts.createItem },
});
// @ts-expect-error Compatibility is checked against the selected aggregate version.
app.makeFrontend({ ...main, aggregateVersion: '2.0.0' });
// @ts-expect-error Compatibility is checked against the selected service version.
app.makeFrontend({ ...products, serviceVersion: '2.0.0' });
// @ts-expect-error Service models cannot substitute an incompatible model.
app.makeFrontend({ ...products, models: { user: Item } });
