import { userAggregate as authenticationFixtureOwner } from '@zerospin/core/fixtures/system';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { defineModel } from '../models/defineModel.ts';
import { makeModelVersion } from '../models/makeModelVersion.ts';
import { makeReplica } from '../models/makeReplica.ts';
import { makeSelection } from '../models/makeSelection.ts';

import { defineAggregate } from './defineAggregate.ts';
import { makeAggregateVersion } from './makeAggregateVersion.ts';
import { requireVersion as requireAggregateVersion } from './requireVersion.ts';

const ServiceProduct = makeModelVersion(
  defineModel({ name: 'product', abbreviation: 'prd' }),
  {
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);
const ProductReplica = makeReplica({
  sourceModel: ServiceProduct,
  modelVersion: ServiceProduct.version,
  serviceName: 'catalog',
});
const account = makeAggregateVersion(defineAggregate({ name: 'account' }), {
  ...authenticationFixtureOwner.authentication,
  version: '1.0.0',
  models: { product: ProductReplica },
  contracts: {},
  selections: {
    product: makeSelection({ model: ProductReplica, where: () => ({}) }),
  },
});

assert<Equals<typeof account.name, 'account'>>();
assert<Equals<typeof account.version, '1.0.0'>>();
assert<Equals<typeof account.models.product, typeof ProductReplica>>();
void requireAggregateVersion(account, account.version);
// @ts-expect-error aggregate definitions are immutable after construction
account.name = 'account';
// @ts-expect-error aggregate model registries are immutable after construction
account.models.product = ProductReplica;
// @ts-expect-error aggregate selections are immutable after construction
account.selections.product.model = ProductReplica;

makeAggregateVersion(defineAggregate({ name: 'raw-selection-identity-key' }), {
  ...authenticationFixtureOwner.authentication,
  version: '1.0.0',
  models: { product: ServiceProduct },
  contracts: {},
  selections: {
    product: {
      model: ServiceProduct,
      where: ({
        authentication: { userId },
      }: {
        authentication: { userId: string };
      }) => ({
        id: userId,
      }),
    },
  },
});

makeAggregateVersion(
  defineAggregate({ name: 'invalid-raw-selection-identity-key' }),
  {
    ...authenticationFixtureOwner.authentication,
    version: '1.0.0',
    models: { product: ServiceProduct },
    contracts: {},
    selections: {
      product: {
        model: ServiceProduct,
        // @ts-expect-error raw selection callbacks require a string-compatible userId
        where: ({
          authentication: { userId },
        }: {
          authentication: { userId: number };
        }) => ({
          id: userId,
        }),
      },
    },
  },
);

makeAggregateVersion(defineAggregate({ name: 'authorized' }), {
  ...authenticationFixtureOwner.authentication,
  version: '1.0.0',
  models: { product: ProductReplica },
  contracts: {},
  selections: {
    product: makeSelection({ model: ProductReplica, where: () => ({}) }),
  },
  authorize: ({ authentication: { userId }, aggregateId, db }) => {
    assert<Equals<typeof userId, string>>();
    assert<Equals<typeof aggregateId, `acct_${string}`>>();
    void db.query.product;
    // @ts-expect-error Authorization can only query models owned by this aggregate.
    void db.query.other;
    return Effect.void;
  },
});

const VersionedItem = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    attributes: { amount: primitives.integer() },
    indexes: [],
    version: '2.0.0',
  },
);
const versionedList = makeAggregateVersion(defineAggregate({ name: 'list' }), {
  ...authenticationFixtureOwner.authentication,
  version: '1.0.0',
  models: { item: VersionedItem },
  contracts: {},
  selections: {
    item: makeSelection({ model: VersionedItem, where: () => ({}) }),
  },
});

// @ts-expect-error Mutation adapters are not part of authored definitions.
void versionedList.mutationAdapters;

const open = makeAggregateVersion(defineAggregate({ name: 'open' }), {
  version: '1.0.0',
  models: {},
  contracts: {},
  selections: {},
});
assert<
  Equals<
    Schema.Schema.Type<(typeof open.authentication)['authenticationSchema']>,
    { readonly aggregateId: string }
  >
>();
assert<
  Equals<
    Schema.Schema.Type<(typeof open.authentication)['selectionSchema']>,
    { readonly aggregateId: string }
  >
>();
void open.authentication.pattern.source;
