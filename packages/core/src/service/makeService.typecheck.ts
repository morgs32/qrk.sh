import { userAggregate as authenticationFixtureOwner } from '@zerospin/core/fixtures/system';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { defineModel } from '../models/defineModel.ts';
import { makeModelVersion } from '../models/makeModelVersion.ts';
import { makeReplica } from '../models/makeReplica.ts';

import { makeService } from './makeService.ts';
import { requireVersion as requireServiceVersion } from './requireVersion.ts';

const Product = makeModelVersion(
  defineModel({ name: 'product', abbreviation: 'prd' }),
  {
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);
const catalog = makeService({
  ...authenticationFixtureOwner.authentication,
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
  authorize: () => Effect.void,
});

assert<Equals<typeof catalog.name, 'catalog'>>();
assert<Equals<typeof catalog.version, '1.0.0'>>();
assert<Equals<typeof catalog.models.product, typeof Product>>();
assert<Equals<typeof catalog.queries.products.kind, 'service'>>();
assert<Equals<typeof catalog.queries.products.name, 'products'>>();
assert<Equals<typeof catalog.queries.products.serviceName, 'catalog'>>();

void requireServiceVersion(catalog, catalog.version);

// @ts-expect-error service definitions are immutable after construction
catalog.name = 'catalog';
// @ts-expect-error service model registries are immutable after construction
catalog.models.product = Product;
// @ts-expect-error resolved service queries are immutable after construction
catalog.queries.products.name = 'products';
// @ts-expect-error Service frontend registries are no longer authored.
void catalog.frontends;

makeService({
  ...authenticationFixtureOwner.authentication,
  name: 'catalog',
  version: '1.0.0',
  models: { product: Product },
  contracts: {},
});

makeService({
  ...authenticationFixtureOwner.authentication,
  name: 'catalog',
  version: '1.0.0',
  models: { product: Product },
  contracts: {},
  authorize: () => Effect.void,
});

const ProductReplica = makeReplica({
  sourceModel: Product,
  modelVersion: Product.version,
  serviceName: 'catalog',
});
makeService({
  ...authenticationFixtureOwner.authentication,
  name: 'catalog',
  version: '1.0.0',
  models: {
    // @ts-expect-error services require authoritative source models
    product: ProductReplica,
  },
  contracts: {},
});

const VersionedProduct = makeModelVersion(
  defineModel({ name: 'versionedProduct', abbreviation: 'vpd' }),
  {
    attributes: { amount: primitives.integer() },
    indexes: [],
    version: '2.0.0',
  },
);
const versionedCatalog = makeService({
  ...authenticationFixtureOwner.authentication,
  name: 'catalog',
  version: '1.0.0',
  models: { versionedProduct: VersionedProduct },
  contracts: {},
});

// @ts-expect-error Mutation adapters are not part of authored definitions.
void versionedCatalog.mutationAdapters;
