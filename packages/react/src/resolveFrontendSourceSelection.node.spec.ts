import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeModel } from '@zerospin/core/models/makeModel';
import { makeReplica } from '@zerospin/core/models/makeReplica';
import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { resolveFrontendSourceSelection } from './resolveFrontendSourceSelection';

const ProductSource = makeModel(
  {
    abbreviation: 'prd',
    modelName: 'product',
    attributes: {
      description: primitives.text(),
      name: primitives.text(),
    },
    indexes: [],
    version: '2.0.0',
  },
  [
    {
      abbreviation: 'prd',
      modelName: 'product',
      attributes: { name: primitives.text() },
      indexes: [],
      version: '1.0.0',
      adaptResource: ({ resource }) =>
        Effect.succeed({
          id: resource.id,
          modelName: resource.modelName,
          createdAt: resource.createdAt,
          updatedAt: resource.updatedAt,
          version: '1.0.0',
          name: resource.name,
        }),
    },
  ],
);

const CartItemSource = makeModel(
  {
    abbreviation: 'cit',
    modelName: 'cartItem',
    attributes: {
      productId: primitives.ref({
        table: ProductSource.table,
        relation: 'product',
        inverse: 'cartItems',
      }),
      quantity: primitives.integer(),
    },
    indexes: [],
    version: '2.0.0',
  },
  [
    {
      abbreviation: 'cit',
      modelName: 'cartItem',
      attributes: {
        productId: primitives.ref({
          table: ProductSource.table,
          relation: 'product',
          inverse: 'cartItems',
        }),
      },
      indexes: [],
      version: '1.0.0',
      adaptResource: ({ resource }) =>
        Effect.succeed({
          id: resource.id,
          modelName: resource.modelName,
          createdAt: resource.createdAt,
          updatedAt: resource.updatedAt,
          version: '1.0.0',
          productId: resource.productId,
        }),
    },
  ],
);

const ProductReplica = makeReplica({
  sourceModel: ProductSource,
  serviceName: 'catalog',
});

const CartItemReplica = makeReplica({
  sourceModel: CartItemSource,
  serviceName: 'catalog',
});

describe('resolveFrontendSourceSelection', () => {
  it('keeps historical service models authoritative', () => {
    const controller = makeFrontendController({
      systemName: 'historical-selection',
      serviceName: 'catalog',
      frontendName: 'service-products',
      models: {
        cartItem: CartItemSource,
        product: ProductSource,
      },
    });

    const selected = resolveFrontendSourceSelection({
      entry: {
        controller,
        models: {
          cartItem: '1.0.0',
          product: '1.0.0',
        },
      },
      configuredFrontendName: 'service-products',
      systemName: 'historical-selection',
    });
    const selectedProduct = selected.models.product;
    const selectedCartItem = selected.models.cartItem;
    if (selectedProduct === undefined || selectedCartItem === undefined) {
      throw new Error('expected selected historical service models');
    }

    expect(selected.kind).toBe('service');
    expect(selectedProduct.version).toBe('1.0.0');
    expect(selectedCartItem.version).toBe('1.0.0');
    expect('sourceModel' in selectedProduct).toBe(false);
    expect('deletedAt' in selectedProduct.propertiesShape).toBe(false);
    expect('description' in selectedProduct.attributes).toBe(false);
    expect('quantity' in selectedCartItem.attributes).toBe(false);
    expect(selectedCartItem.attributes.productId.table).toBe(
      selectedProduct.table,
    );
  });

  it('rebuilds related historical replicas against exact selected source tables', () => {
    const controller = makeFrontendController({
      systemName: 'historical-selection',
      aggregateName: 'account',
      frontendName: 'aggregate-products',
      contracts: {},
      models: {
        cartItem: CartItemReplica,
        product: ProductReplica,
      },
    });

    const selected = resolveFrontendSourceSelection({
      entry: {
        controller,
        models: {
          cartItem: '1.0.0',
          product: '1.0.0',
        },
      },
      configuredFrontendName: 'aggregate-products',
      systemName: 'historical-selection',
    });
    const selectedProduct = selected.models.product;
    const selectedCartItem = selected.models.cartItem;
    if (
      selectedProduct === undefined ||
      selectedCartItem === undefined ||
      !('sourceModel' in selectedProduct) ||
      !('serviceName' in selectedProduct) ||
      !('sourceModel' in selectedCartItem) ||
      !('serviceName' in selectedCartItem)
    ) {
      throw new Error('expected selected historical model replicas');
    }
    const selectedProductSource = selectedProduct.sourceModel;
    const selectedCartItemSource = selectedCartItem.sourceModel;
    if (
      typeof selectedProductSource !== 'object' ||
      selectedProductSource === null ||
      !('version' in selectedProductSource) ||
      !('table' in selectedProductSource) ||
      typeof selectedCartItemSource !== 'object' ||
      selectedCartItemSource === null ||
      !('version' in selectedCartItemSource) ||
      !('attributes' in selectedCartItemSource)
    ) {
      throw new Error('expected valid selected historical source models');
    }

    expect(selected.kind).toBe('aggregate');
    expect(selectedProduct.version).toBe('1.0.0');
    expect(selectedCartItem.version).toBe('1.0.0');
    expect(selectedProduct.serviceName).toBe('catalog');
    expect(selectedCartItem.serviceName).toBe('catalog');
    expect(selectedProductSource.version).toBe('1.0.0');
    expect(selectedCartItemSource.version).toBe('1.0.0');
    expect('description' in selectedProductSource.attributes).toBe(false);
    expect('description' in selectedProduct.attributes).toBe(false);
    expect('quantity' in selectedCartItemSource.attributes).toBe(false);
    expect('quantity' in selectedCartItem.attributes).toBe(false);
    expect(selectedProduct.propertiesShape.deletedAt).toMatchObject({
      kind: 'date',
      nullable: true,
    });
    expect(selectedCartItem.propertiesShape.deletedAt).toMatchObject({
      kind: 'date',
      nullable: true,
    });
    expect(
      Reflect.get(selectedCartItemSource.attributes, 'productId').table,
    ).toBe(selectedProductSource.table);
  });

  it('rejects historical refs whose same-name table is not the exact selected source', () => {
    const UnrelatedProduct = makeModel(
      {
        abbreviation: 'uprd',
        modelName: 'product',
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
      [],
    );
    const BadCartItemSource = makeModel(
      {
        abbreviation: 'bcit',
        modelName: 'badCartItem',
        attributes: {
          productId: primitives.ref({
            table: ProductSource.table,
            relation: 'product',
            inverse: 'badCartItems',
          }),
          quantity: primitives.integer(),
        },
        indexes: [],
        version: '2.0.0',
      },
      [
        {
          abbreviation: 'bcit',
          modelName: 'badCartItem',
          attributes: {
            productId: primitives.ref({
              table: UnrelatedProduct.table,
              relation: 'product',
              inverse: 'badCartItems',
            }),
          },
          indexes: [],
          version: '1.0.0',
          adaptResource: ({ resource }) =>
            Effect.succeed({
              id: resource.id,
              modelName: resource.modelName,
              createdAt: resource.createdAt,
              updatedAt: resource.updatedAt,
              version: '1.0.0',
              productId: resource.productId,
            }),
        },
      ],
    );
    const BadCartItemReplica = makeReplica({
      sourceModel: BadCartItemSource,
      serviceName: 'catalog',
    });
    const controller = makeFrontendController({
      systemName: 'historical-selection',
      aggregateName: 'account',
      frontendName: 'invalid-products',
      contracts: {},
      models: {
        badCartItem: BadCartItemReplica,
        product: ProductReplica,
      },
    });

    expect(() =>
      resolveFrontendSourceSelection({
        entry: {
          controller,
          models: {
            badCartItem: '1.0.0',
            product: '1.0.0',
          },
        },
        configuredFrontendName: 'invalid-products',
        systemName: 'historical-selection',
      }),
    ).toThrow(/references unselected model "product"/);
  });
});
