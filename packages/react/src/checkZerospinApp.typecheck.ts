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

import { checkZerospinApp } from './index';

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
const app = makeZerospinApp({
  systemName: 'system-worker',

  frontends: { main },
  layer,
});
const result = checkZerospinApp<typeof system>(app);
checkZerospinApp<typeof emptySystem>({ ...app, frontends: {} });
// @ts-expect-error An empty aggregate registry must not widen to all owners.
checkZerospinApp<typeof emptySystem>(app);
assert<Equals<typeof result, void>>();
assert<Equals<typeof app.systemName, 'system-worker'>>();
assert<Equals<typeof app.frontends.main.frontend, typeof main>>();
assert<Equals<typeof app.frontends.main.models, typeof main.models>>();

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
checkZerospinApp<typeof emptySystem>({
  ...app,
  // @ts-expect-error An empty service registry must not widen to all owners.
  frontends: { products: { frontend: products } },
});
checkZerospinApp<typeof system>(
  makeZerospinApp({
    systemName: 'system-worker',

    frontends: { main, subset, second, products, productsV2 },
    layer,
  }),
);
checkZerospinApp<typeof system>({ ...app, frontends: {} });
checkZerospinApp<typeof system>({
  ...app,
  frontends: {
    products: { frontend: { ...products, models: { user: User } } },
  },
});

// @ts-expect-error System names must match.
checkZerospinApp<typeof system>({ ...app, systemName: 'other' });
checkZerospinApp<typeof system>({
  ...app,
  // @ts-expect-error Broad aggregate index signatures must not admit unknown owners.
  frontends: { main: { frontend: { ...main, aggregateName: 'missing' } } },
});
checkZerospinApp<typeof system>({
  ...app,
  frontends: {
    // @ts-expect-error Broad service index signatures must not admit unknown owners.
    products: { frontend: { ...products, serviceName: 'missing' } },
  },
});
checkZerospinApp<typeof system>({
  ...app,
  // @ts-expect-error Unknown aggregate version.
  frontends: { main: { frontend: { ...main, aggregateVersion: '3.0.0' } } },
});
checkZerospinApp<typeof system>({
  ...app,
  frontends: {
    // @ts-expect-error Unknown service version.
    products: { frontend: { ...products, serviceVersion: '3.0.0' } },
  },
});
checkZerospinApp<typeof system>({
  ...app,
  // @ts-expect-error Frontend system names must match, too.
  frontends: { main: { frontend: { ...main, systemName: 'other' } } },
});
checkZerospinApp<typeof system>({
  ...app,
  // @ts-expect-error A model under an existing key must be compatible.
  frontends: { main: { frontend: { ...main, models: { user: Item } } } },
});
checkZerospinApp<typeof system>({
  ...app,
  frontends: {
    main: {
      frontend: {
        ...main,
        // @ts-expect-error A contract under an existing key must be compatible.
        contracts: { createList: main.contracts.createItem },
      },
    },
  },
});
checkZerospinApp<typeof system>({
  ...app,
  // @ts-expect-error Aggregate compatibility is checked against the selected version.
  frontends: { main: { frontend: { ...main, aggregateVersion: '2.0.0' } } },
});
checkZerospinApp<typeof system>({
  ...app,
  frontends: {
    // @ts-expect-error Service compatibility is checked against the selected version.
    products: { frontend: { ...products, serviceVersion: '2.0.0' } },
  },
});
checkZerospinApp<typeof system>({
  ...app,
  frontends: {
    // @ts-expect-error Service models cannot substitute an incompatible model.
    products: { frontend: { ...products, models: { user: Item } } },
  },
});
