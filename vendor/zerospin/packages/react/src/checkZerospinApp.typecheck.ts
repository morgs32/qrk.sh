import { aggregates } from '@zerospin/core/aggregate/index';
import { authentication } from '@zerospin/core/authentication/index';
import {
  authenticationSignature,
  Item,
  main,
  User,
} from '@zerospin/core/fixtures/system';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeService } from '@zerospin/core/service/makeService';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import type { IAnyError } from '@zerospin/error';
import { Effect, Schema, type Layer } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeZerospinApp } from './makeZerospinApp';

import { checkZerospinApp } from './index';

declare const layer: Layer.Layer<PublishableKey | ZerospinApiUrl, IAnyError>;
const userV1 = aggregates.makeVersion(
  aggregates.makeAggregate({ name: 'user' }),
  {
    version: '1.0.0',
    models: main.models,
    contracts: main.contracts,
    selections: {},
  },
);
const userV2 = aggregates.makeVersion(
  aggregates.makeAggregate({ name: 'user' }),
  {
    version: '2.0.0',
    models: { user: User },
    contracts: {},
    selections: {},
  },
);
const catalog = makeService({
  name: 'catalog',
  version: '1.0.0',
  models: { user: User, item: Item },
  contracts: {},
});
const catalogV2 = makeService({
  name: 'catalog',
  version: '2.0.0',
  models: { user: User },
  contracts: {},
});
const system = makeSystem({
  name: 'system-worker',
  authentication: [
    authentication.makeVersion({
      version: '1.0.0',
      signature: authenticationSignature.signature,
      authenticate: ({ signature }) => Effect.succeed(signature.userId),
    }),
    authentication.makeVersion({
      version: '2.0.0',
      signature: Schema.Struct({ token: Schema.String }),
      authenticate: () => Effect.succeed('usr_1'),
    }),
  ],
  aggregates: { user: [userV1, userV2] },
  services: { catalog: [catalog, catalogV2] },
});
const emptySystem = makeSystem({
  name: 'system-worker',
  authentication: system.authentication,
  aggregates: {},
  services: {},
});
const app = makeZerospinApp({
  systemName: 'system-worker',
  authentication: {
    version: '1.0.0',
    signature: authenticationSignature.signature,
  },
  frontends: { main },
  layer,
});
const result = checkZerospinApp<typeof system>(app);
checkZerospinApp<typeof emptySystem>({ ...app, frontends: {} });
// @ts-expect-error An empty aggregate registry must not widen to all owners.
checkZerospinApp<typeof emptySystem>(app);
assert<Equals<typeof result, void>>();
assert<Equals<typeof app.systemName, 'system-worker'>>();
assert<Equals<typeof app.authentication.version, '1.0.0'>>();
assert<
  Equals<
    typeof app.authentication.signature,
    typeof authenticationSignature.signature
  >
>();
assert<Equals<typeof app.frontends.main.frontend, typeof main>>();
assert<Equals<typeof app.frontends.main.models, typeof main.models>>();

const subset = makeFrontendController({
  systemName: 'system-worker',
  name: 'subset',
  aggregateName: 'user',
  aggregateVersion: '1.0.0',
  models: { user: User },
  contracts: { createList: main.contracts.createList },
});
const second = makeFrontendController({
  systemName: 'system-worker',
  name: 'second',
  aggregateName: 'user',
  aggregateVersion: '2.0.0',
  models: { user: User },
  contracts: {},
});
const products = makeFrontendController({
  systemName: 'system-worker',
  name: 'products',
  serviceName: 'catalog',
  serviceVersion: '1.0.0',
  models: catalog.models,
});
const productsV2 = makeFrontendController({
  systemName: 'system-worker',
  name: 'productsV2',
  serviceName: 'catalog',
  serviceVersion: '2.0.0',
  models: { user: User },
});
// @ts-expect-error An empty service registry must not widen to all owners.
checkZerospinApp<typeof emptySystem>({
  ...app,
  frontends: { products: { frontend: products } },
});
checkZerospinApp<typeof system>(
  makeZerospinApp({
    systemName: 'system-worker',
    authentication: {
      version: '2.0.0',
      signature: system.authentication[1].signature,
    },
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
// @ts-expect-error Unsupported authentication version.
checkZerospinApp<typeof system>({
  ...app,
  authentication: { ...app.authentication, version: '3.0.0' },
});
// @ts-expect-error Supported versions must retain their own signature type.
checkZerospinApp<typeof system>({
  ...app,
  authentication: {
    version: '1.0.0',
    signature: system.authentication[1].signature,
  },
});
// @ts-expect-error Incompatible signature.
checkZerospinApp<typeof system>({
  ...app,
  authentication: { version: '1.0.0', signature: Schema.Number },
});
// @ts-expect-error Broad aggregate index signatures must not admit unknown owners.
checkZerospinApp<typeof system>({
  ...app,
  frontends: { main: { frontend: { ...main, aggregateName: 'missing' } } },
});
// @ts-expect-error Broad service index signatures must not admit unknown owners.
checkZerospinApp<typeof system>({
  ...app,
  frontends: {
    products: { frontend: { ...products, serviceName: 'missing' } },
  },
});
// @ts-expect-error Unknown aggregate version.
checkZerospinApp<typeof system>({
  ...app,
  frontends: { main: { frontend: { ...main, aggregateVersion: '3.0.0' } } },
});
// @ts-expect-error Unknown service version.
checkZerospinApp<typeof system>({
  ...app,
  frontends: {
    products: { frontend: { ...products, serviceVersion: '3.0.0' } },
  },
});
// @ts-expect-error Frontend system names must match, too.
checkZerospinApp<typeof system>({
  ...app,
  frontends: { main: { frontend: { ...main, systemName: 'other' } } },
});
// @ts-expect-error A model under an existing key must be compatible.
checkZerospinApp<typeof system>({
  ...app,
  frontends: { main: { frontend: { ...main, models: { user: Item } } } },
});
// @ts-expect-error A contract under an existing key must be compatible.
checkZerospinApp<typeof system>({
  ...app,
  frontends: {
    main: {
      frontend: {
        ...main,
        contracts: { createList: main.contracts.createItem },
      },
    },
  },
});
// @ts-expect-error Aggregate compatibility is checked against the selected version.
checkZerospinApp<typeof system>({
  ...app,
  frontends: { main: { frontend: { ...main, aggregateVersion: '2.0.0' } } },
});
// @ts-expect-error Service compatibility is checked against the selected version.
checkZerospinApp<typeof system>({
  ...app,
  frontends: {
    products: { frontend: { ...products, serviceVersion: '2.0.0' } },
  },
});
// @ts-expect-error Service models cannot substitute an incompatible model.
checkZerospinApp<typeof system>({
  ...app,
  frontends: {
    products: { frontend: { ...products, models: { user: Item } } },
  },
});
