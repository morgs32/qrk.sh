import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/makeAggregateVersion';
import {
  aggregateFrontendProps,
  serviceFrontendProps,
} from '@zerospin/core/fixtures/frontendProps';
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
const userV1 = makeAggregateVersion(defineAggregate({ name: 'user' }), {
  ...userAggregate.authentication,
  version: '1.0.0',
  models: main.models,
  contracts: main.contracts,
  selections: {},
});
const userV2 = makeAggregateVersion(defineAggregate({ name: 'user' }), {
  ...userAggregate.authentication,
  version: '2.0.0',
  models: { user: User },
  contracts: {},
  selections: {},
});
const catalog = makeService({
  ...userAggregate.authentication,
  name: 'catalog',
  version: '1.0.0',
  models: { user: User, list: List, item: Item },
  contracts: {},
});
const catalogV2 = makeService({
  ...userAggregate.authentication,
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
const Main = app.makeAggregateFrontend(aggregateFrontendProps(main));
assert<Equals<typeof app.systemName, 'system-worker'>>();
const selectedDefinition: typeof main = Main.frontend;
void selectedDefinition;
assert<Equals<typeof Main.models, typeof main.models>>();
const subset = makeFrontendController({
  authenticationSchema: main.authentication.authenticationSchema,
  systemName: 'system-worker',
  name: 'subset',
  aggregateName: 'user',
  aggregateVersion: '1.0.0',
  models: { user: User, list: List },
  contracts: { createList: main.contracts.createList },
});
const second = makeFrontendController({
  authenticationSchema: main.authentication.authenticationSchema,
  systemName: 'system-worker',
  name: 'second',
  aggregateName: 'user',
  aggregateVersion: '2.0.0',
  models: { user: User },
  contracts: {},
});
const products = makeFrontendController({
  authenticationSchema: main.authentication.authenticationSchema,
  systemName: 'system-worker',
  name: 'products',
  serviceName: 'catalog',
  serviceVersion: '1.0.0',
  models: catalog.models,
});
const productsV2 = makeFrontendController({
  authenticationSchema: main.authentication.authenticationSchema,
  systemName: 'system-worker',
  name: 'productsV2',
  serviceName: 'catalog',
  serviceVersion: '2.0.0',
  models: { user: User },
});
app.makeAggregateFrontend(aggregateFrontendProps(subset));
app.makeAggregateFrontend(aggregateFrontendProps(second));
app.makeServiceFrontend(serviceFrontendProps(products));
app.makeServiceFrontend(serviceFrontendProps(productsV2));
app.makeServiceFrontend(
  serviceFrontendProps({ ...products, models: { user: User } }),
);
// @ts-expect-error Empty registries cannot admit aggregates.
emptyApp.makeAggregateFrontend(aggregateFrontendProps(main));
// @ts-expect-error Empty registries cannot admit services.
emptyApp.makeServiceFrontend(serviceFrontendProps(products));
makeZerospinApp<typeof system>({
  // @ts-expect-error The app must match the system name.
  systemName: 'other',
  layer,
});
app.makeAggregateFrontend(
  // @ts-expect-error Unknown aggregate.
  aggregateFrontendProps({ ...main, aggregateName: 'missing' }),
);
app.makeServiceFrontend(
  // @ts-expect-error Unknown service.
  serviceFrontendProps({ ...products, serviceName: 'missing' }),
);
app.makeAggregateFrontend(
  // @ts-expect-error Unknown aggregate version.
  aggregateFrontendProps({ ...main, aggregateVersion: '3.0.0' }),
);
app.makeServiceFrontend(
  // @ts-expect-error Unknown service version.
  serviceFrontendProps({ ...products, serviceVersion: '3.0.0' }),
);
app.makeAggregateFrontend({
  ...aggregateFrontendProps(main),
  // @ts-expect-error Frontend system must match.
  systemName: 'other',
});
app.makeAggregateFrontend(
  // @ts-expect-error A model under an existing key must be compatible.
  aggregateFrontendProps({ ...main, models: { user: Item } }),
);
app.makeAggregateFrontend(
  // @ts-expect-error Contract names and definitions must agree.
  aggregateFrontendProps({
    ...main,
    contracts: { createList: main.contracts.createItem },
  }),
);
app.makeAggregateFrontend(
  // @ts-expect-error Compatibility is checked against the selected aggregate version.
  aggregateFrontendProps({ ...main, aggregateVersion: '2.0.0' }),
);
app.makeServiceFrontend(
  // @ts-expect-error Compatibility is checked against the selected service version.
  serviceFrontendProps({ ...products, serviceVersion: '2.0.0' }),
);
app.makeServiceFrontend(
  // @ts-expect-error Service models cannot substitute an incompatible model.
  serviceFrontendProps({ ...products, models: { user: Item } }),
);
