import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeModel, makeModelVersion } from '../models/makeModel.ts';
import { makeReplica } from '../models/makeReplica.ts';
import { makeSelection } from '../models/makeSelection.ts';

import { makeAggregate } from './makeAggregate.ts';
import { makeAggregateVersion } from './makeVersion.ts';
import { requireVersion as requireAggregateVersion } from './requireVersion.ts';

const ServiceProduct = makeModelVersion(
  makeModel({ name: 'product', abbreviation: 'prd' }),
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
const account = makeAggregateVersion(makeAggregate({ name: 'account' }), {
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

makeAggregateVersion(makeAggregate({ name: 'raw-selection-user-id' }), {
  version: '1.0.0',
  models: { product: ServiceProduct },
  contracts: {},
  selections: {
    product: {
      model: ServiceProduct,
      where: ({ userId }: { userId: `usr_${string}` }) => ({ id: userId }),
    },
  },
});

makeAggregateVersion(makeAggregate({ name: 'invalid-raw-selection-user-id' }), {
  version: '1.0.0',
  models: { product: ServiceProduct },
  contracts: {},
  selections: {
    product: {
      model: ServiceProduct,
      // @ts-expect-error raw selection callbacks require a string-compatible userId
      where: ({ userId }: { userId: number }) => ({ id: userId }),
    },
  },
});

makeAggregateVersion(makeAggregate({ name: 'authorized' }), {
  version: '1.0.0',
  models: { product: ProductReplica },
  contracts: {},
  selections: {
    product: makeSelection({ model: ProductReplica, where: () => ({}) }),
  },
  authorize: ({ userId, aggregateId, db }) => {
    assert<Equals<typeof userId, string>>();
    assert<Equals<typeof aggregateId, `acct_${string}`>>();
    void db.query.product;
    // @ts-expect-error Authorization can only query models owned by this aggregate.
    void db.query.other;
    return Effect.void;
  },
});

const VersionedItem = makeModelVersion(
  makeModel({ name: 'item', abbreviation: 'itm' }),
  {
    attributes: { amount: primitives.integer() },
    indexes: [],
    version: '2.0.0',
  },
);
const versionedList = makeAggregateVersion(makeAggregate({ name: 'list' }), {
  version: '1.0.0',
  models: { item: VersionedItem },
  contracts: {},
  selections: {
    item: makeSelection({ model: VersionedItem, where: () => ({}) }),
  },
});

// @ts-expect-error Mutation adapters are not part of authored definitions.
void versionedList.mutationAdapters;
