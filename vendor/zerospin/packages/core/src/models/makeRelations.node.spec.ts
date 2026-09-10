import { primitives } from '@zerospin/schema';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import { makeRelations } from './makeRelations.ts';
import { makeReplica } from './makeReplica.ts';

import { models as modelDefinitions } from './index.ts';

const User = modelDefinitions.makeVersion(
  modelDefinitions.makeModel({ name: 'user', abbreviation: 'usr' }),
  {
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
);

const List = modelDefinitions.makeVersion(
  modelDefinitions.makeModel({ name: 'list', abbreviation: 'lst' }),
  {
    attributes: {
      name: primitives.text(),
      userId: primitives.ref({
        table: User.table,
        relation: 'user',
        inverse: 'lists',
      }),
    },
    indexes: [],
    version: '1.0.0',
  },
);

const Item = modelDefinitions.makeVersion(
  modelDefinitions.makeModel({ name: 'item', abbreviation: 'itm' }),
  {
    attributes: {
      listId: primitives.ref({
        table: List.table,
        relation: 'list',
        inverse: 'items',
      }),
    },
    indexes: [],
    version: '1.0.0',
  },
);

const models = {
  item: Item,
  list: List,
  user: User,
};

const ProductSource = modelDefinitions.makeVersion(
  modelDefinitions.makeModel({ name: 'product', abbreviation: 'prd' }),
  {
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
);

const CartItemSource = modelDefinitions.makeVersion(
  modelDefinitions.makeModel({ name: 'cartItem', abbreviation: 'cit' }),
  {
    attributes: {
      productId: primitives.ref({
        table: ProductSource.table,
        relation: 'product',
        inverse: 'cartItems',
      }),
    },
    indexes: [],
    version: '1.0.0',
  },
);

const ProductReplica = makeReplica({
  sourceModel: ProductSource,
  modelVersion: ProductSource.version,
  serviceName: 'catalog',
});

const CartItemReplica = makeReplica({
  sourceModel: CartItemSource,
  modelVersion: CartItemSource.version,
  serviceName: 'catalog',
});

describe('makeRelations', () => {
  it('builds relation descriptors with ownRef and connectedRef overloads', () => {
    const relations = makeRelations(models, ({ connectOne, connectMany }) => ({
      list: {
        user: connectOne({
          model: User,
          ownRef: 'userId',
        }),
        items: connectMany({
          model: Item,
          connectedRef: 'listId',
        }),
      },
      user: {
        lists: connectMany({
          model: List,
          connectedRef: 'userId',
        }),
      },
    }));

    expect(relations.list?.user.kind).toBe('one');
    expect(relations.list?.items.kind).toBe('many');
    expect(relations.list?.user.ownRef).toBe('userId');
    expect(relations.list?.items.connectedRef).toBe('listId');
    expect(relations.user?.lists.connectedRef).toBe('userId');
  });

  it('preserves source model keys and descriptor typing', () => {
    const relations = makeRelations(models, ({ connectOne, connectMany }) => ({
      item: {
        list: connectOne({
          model: List,
          ownRef: 'listId',
        }),
      },
      list: {
        user: connectOne({
          model: User,
          ownRef: 'userId',
        }),
        items: connectMany({
          model: Item,
          connectedRef: 'listId',
        }),
      },
    }));

    const listItems = relations.list?.items;
    if (listItems === undefined) {
      throw new Error('expected relations.list.items');
    }
    const itemList = relations.item?.list;
    if (itemList === undefined) {
      throw new Error('expected relations.item.list');
    }

    assert<Equals<typeof listItems.kind, 'many'>>();
    assert<Equals<typeof itemList.kind, 'one'>>();
  });

  it('accepts exact authoritative source-table refs between replicas', () => {
    const relations = makeRelations(
      {
        cartItem: CartItemReplica,
        product: ProductReplica,
      },
      ({ connectOne, connectMany }) => ({
        cartItem: {
          product: connectOne({
            model: ProductReplica,
            ownRef: 'productId',
          }),
        },
        product: {
          cartItems: connectMany({
            model: CartItemReplica,
            connectedRef: 'productId',
          }),
        },
      }),
    );

    expect(relations.cartItem?.product.ownRef).toBe('productId');
    expect(relations.product?.cartItems.connectedRef).toBe('productId');
  });

  it('rejects same-name source tables that are not the exact replica source', () => {
    const UnrelatedProductSource = modelDefinitions.makeVersion(
      modelDefinitions.makeModel({ name: 'product', abbreviation: 'prd' }),
      {
        attributes: {
          name: primitives.text(),
        },
        indexes: [],
        version: '1.0.0',
      },
    );
    const UnrelatedCartItemSource = modelDefinitions.makeVersion(
      modelDefinitions.makeModel({ name: 'cartItem', abbreviation: 'cit' }),
      {
        attributes: {
          productId: primitives.ref({
            table: UnrelatedProductSource.table,
            relation: 'product',
            inverse: 'cartItems',
          }),
        },
        indexes: [],
        version: '1.0.0',
      },
    );
    const UnrelatedCartItemReplica = makeReplica({
      sourceModel: UnrelatedCartItemSource,
      modelVersion: UnrelatedCartItemSource.version,
      serviceName: 'catalog',
    });
    const replicaModels = {
      cartItem: UnrelatedCartItemReplica,
      product: ProductReplica,
    };

    expect(() =>
      makeRelations(replicaModels, ({ connectOne }) => ({
        cartItem: {
          product: connectOne({
            model: ProductReplica,
            ownRef: 'productId',
          }),
        },
      })),
    ).toThrow(/must match connected model table/);

    expect(() =>
      makeRelations(replicaModels, ({ connectMany }) => ({
        product: {
          cartItems: connectMany({
            model: UnrelatedCartItemReplica,
            connectedRef: 'productId',
          }),
        },
      })),
    ).toThrow(/must match parent model table/);
  });

  it('throws when ownRef is not a parent ref to connected model', () => {
    expect(() =>
      makeRelations(models, ({ connectOne }) => ({
        list: {
          invalid: connectOne({
            model: User,
            ownRef: 'name',
          }),
        },
      })),
    ).toThrow(/ownRef "name" is not a ref property/);
  });

  it('throws when connectedRef does not point back to the parent table', () => {
    expect(() =>
      makeRelations(models, ({ connectMany }) => ({
        user: {
          invalid: connectMany({
            model: Item,
            connectedRef: 'listId',
          }),
        },
      })),
    ).toThrow(/must match parent model table/);
  });
});
