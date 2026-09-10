import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { models } from '../models/index.ts';
import { makeReplica } from '../models/makeReplica.ts';

import { makeService } from './makeService.ts';

const Product = models.makeVersion(
  models.makeModel({ name: 'product', abbreviation: 'prd' }),
  {
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);
const controller = makeFrontendController({
  systemName: 'shopping',
  serviceVersion: '1.0.0',
  serviceName: 'catalog',
  name: 'browse',
  models: { product: Product },
});
const catalog = makeService({
  name: 'catalog',
  version: '1.0.0',
  models: { product: Product },
  contracts: {},
  queries: {
    products: {
      paramsSchema: Schema.Struct({ search: Schema.String }),
      query: () => Effect.succeed([] as string[]),
    },
  },
  frontends: { browse: { controller } },
  authorize: () => Effect.void,
});

assert<Equals<typeof catalog.name, 'catalog'>>();
assert<Equals<typeof catalog.version, '1.0.0'>>();
assert<Equals<typeof catalog.models.product, typeof Product>>();
assert<Equals<typeof catalog.queries.products.kind, 'service'>>();
assert<Equals<typeof catalog.queries.products.name, 'products'>>();
assert<Equals<typeof catalog.queries.products.serviceName, 'catalog'>>();
assert<Equals<typeof catalog.frontends.browse.name, 'browse'>>();
void catalog.getVersion(catalog.version);

// @ts-expect-error service definitions are immutable after construction
catalog.name = 'catalog';
// @ts-expect-error service model registries are immutable after construction
catalog.models.product = Product;
// @ts-expect-error resolved service queries are immutable after construction
catalog.queries.products.name = 'products';
// @ts-expect-error resolved service frontend models are immutable after construction
catalog.frontends.browse.models.product = Product;

// @ts-expect-error a service with frontends requires authorization
makeService({
  name: 'catalog',
  version: '1.0.0',
  models: { product: Product },
  contracts: {},
  frontends: { browse: { controller } },
});

makeService({
  name: 'catalog',
  version: '1.0.0',
  models: { product: Product },
  contracts: {},
  frontends: {},
  // @ts-expect-error a service without frontends must omit authorization
  authorize: () => Effect.void,
});

const ProductReplica = makeReplica({
  sourceModel: Product,
  modelVersion: Product.version,
  serviceName: 'catalog',
});
makeService({
  name: 'catalog',
  version: '1.0.0',
  models: {
    // @ts-expect-error services require authoritative source models
    product: ProductReplica,
  },
  contracts: {},
  frontends: {},
});

const wrongFrontendName = makeFrontendController({
  systemName: 'shopping',
  serviceVersion: '1.0.0',
  serviceName: 'catalog',
  name: 'other',
  models: { product: Product },
});
makeService({
  name: 'catalog',
  version: '1.0.0',
  models: { product: Product },
  contracts: {},
  frontends: {
    browse: {
      // @ts-expect-error the binding key must equal controller.name
      controller: wrongFrontendName,
    },
  },
  authorize: () => Effect.void,
});

const VersionedProduct = models.makeVersion(
  models.makeModel({ name: 'versionedProduct', abbreviation: 'vpd' }),
  {
    attributes: { amount: primitives.integer() },
    indexes: [],
    version: '2.0.0',
  },
);
const versionedCatalog = makeService({
  name: 'catalog',
  version: '1.0.0',
  models: { versionedProduct: VersionedProduct },
  contracts: {},
  frontends: {},
});

// @ts-expect-error Mutation adapters are not part of authored definitions.
void versionedCatalog.mutationAdapters;
