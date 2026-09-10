import { primitives } from '@zerospin/schema';
import { assert, type Equals } from 'tsafe';

import { models } from '../models/index.ts';
import { makeService } from '../service/makeService.ts';

import { makeFrontendController } from './makeFrontendController.ts';
import type { IServiceFrontend } from './types.ts';

const product = models.makeModel({ name: 'product', abbreviation: 'prd' });
const productV1 = models.makeVersion(product, {
  version: '1.0.0',
  attributes: { label: primitives.text() },
  indexes: [],
});
const productV2 = models.makeVersion(product, {
  version: '2.0.0',
  attributes: { label: primitives.text() },
  indexes: [],
});
const appV1 = makeService({
  name: 'app',
  version: '1.0.0',
  models: { product: productV1 },
  contracts: {},
});
const frontend = makeFrontendController({
  serviceVersion: '1.0.0',
  systemName: 'shopping',
  serviceName: 'app',
  name: 'catalog',
  models: { product: productV1 },
}) satisfies IServiceFrontend<typeof appV1>;
assert<Equals<typeof frontend.systemName, 'shopping'>>();
assert<Equals<typeof frontend.name, 'catalog'>>();
assert<Equals<typeof frontend.serviceVersion, '1.0.0'>>();
assert<Equals<typeof frontend.serviceName, 'app'>>();
assert<Equals<typeof frontend.models.product, typeof productV1>>();

makeFrontendController({
  serviceVersion: '1.0.0',
  systemName: 'shopping',
  serviceName: 'app',
  name: 'empty',
  models: {},
}) satisfies IServiceFrontend<typeof appV1>;

const wrongName = makeFrontendController({
  serviceVersion: '1.0.0',
  systemName: 'shopping',
  name: 'catalog',
  models: { product: productV1 },
  serviceName: 'other',
});
// @ts-expect-error The service name must match.
wrongName satisfies IServiceFrontend<typeof appV1>;
const wrongModels = makeFrontendController({
  serviceVersion: '1.0.0',
  systemName: 'shopping',
  serviceName: 'app',
  name: 'catalog',
  models: { product: productV2 },
});
// @ts-expect-error The model definition must match the service.
wrongModels satisfies IServiceFrontend<typeof appV1>;
const other = models.makeVersion(
  models.makeModel({ name: 'other', abbreviation: 'oth' }),
  {
    version: '1.0.0',
    attributes: { label: primitives.text() },
    indexes: [],
  },
);
const extraModels = makeFrontendController({
  serviceVersion: '1.0.0',
  systemName: 'shopping',
  serviceName: 'app',
  name: 'catalog',
  models: { product: productV1, other },
});
// @ts-expect-error Extra models must belong to the service definition.
extraModels satisfies IServiceFrontend<typeof appV1>;

const wrongVersion = makeFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  serviceVersion: '2.0.0',
  name: 'catalog',
  models: { product: productV1 },
});
// @ts-expect-error The service version must match.
wrongVersion satisfies IServiceFrontend<typeof appV1>;
