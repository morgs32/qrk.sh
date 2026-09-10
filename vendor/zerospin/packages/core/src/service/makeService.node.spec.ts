import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { contracts } from '../contracts/index.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { models as modelDefinitions } from '../models/index.ts';
import { makeReplica } from '../models/makeReplica.ts';

import { makeService } from './makeService.ts';

const Product = modelDefinitions.makeVersion(
  modelDefinitions.makeModel({ name: 'product', abbreviation: 'prd' }),
  {
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);

const refreshCatalog = contracts.makeVersion(
  contracts.makeCommand('refreshCatalog'),
  {
    payload: { reason: primitives.text() },
    version: '1.0.0',
  },
);

describe('makeService', () => {
  it('rejects removed mutation adapter configuration', () => {
    expect(() =>
      makeService({
        name: 'empty',
        version: '1.0.0',
        models: {},
        contracts: {},
        frontends: {},
        ...{ mutationAdapters: {} },
      }),
    ).toThrow(Schema.SchemaError);
  });

  it('snapshots authored records, preserves canonical leaves, and stamps queries', () => {
    const models = { product: Product };
    const contracts = { refreshCatalog };
    const queries = {
      products: {
        paramsSchema: Schema.Struct({}),
        query: () => Effect.succeed<string[]>([]),
      },
    };
    const controller = makeFrontendController({
      systemName: 'shopping',
      serviceVersion: '1.0.0',
      serviceName: 'catalog',
      name: 'browse',
      models,
    });
    const frontends = { browse: { controller } };

    const service = makeService({
      name: 'catalog',
      version: '1.0.0',
      models,
      contracts,
      queries,
      frontends,
      authorize: () => Effect.void,
    });

    expect(service).toMatchObject({ name: 'catalog' });
    expect(service.models).not.toBe(models);
    expect(service.contracts).not.toBe(contracts);
    expect(service.frontends).not.toBe(frontends);
    expect(service.models.product).toBe(Product);
    expect(service.contracts.refreshCatalog).toBe(refreshCatalog);
    expect(service.frontends.browse.controller).toBe(controller);
    expect(service.queries.products).toMatchObject({
      kind: 'service',
      name: 'products',
      serviceName: 'catalog',
      paramsSchema: queries.products.paramsSchema,
      query: queries.products.query,
    });

    Object.assign(models, { extra: Product });
    Object.assign(contracts, { extra: refreshCatalog });
    Object.assign(queries, { extra: queries.products });
    const replacementQuery = () => Effect.succeed(['changed']);
    queries.products.query = replacementQuery;
    Reflect.deleteProperty(frontends, 'browse');

    expect(service.models).not.toHaveProperty('extra');
    expect(service.contracts).not.toHaveProperty('extra');
    expect(service.queries).not.toHaveProperty('extra');
    expect(service.queries.products.query).not.toBe(replacementQuery);
    expect(service.frontends.browse.controller).toBe(controller);
  });

  it('rejects structural copies of canonical local leaves', () => {
    const controller = makeFrontendController({
      systemName: 'shopping',
      serviceVersion: '1.0.0',
      serviceName: 'catalog',
      name: 'browse',
      models: { product: Product },
    });

    expect(() =>
      makeService({
        name: 'catalog',
        version: '1.0.0',
        models: { product: { ...Product } as typeof Product },
        contracts: { refreshCatalog },
        frontends: {},
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      makeService({
        name: 'catalog',
        version: '1.0.0',
        models: { product: Product },
        contracts: {
          refreshCatalog: {
            ...refreshCatalog,
          } as typeof refreshCatalog,
        },
        frontends: {},
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      makeService({
        name: 'catalog',
        version: '1.0.0',
        models: { product: Product },
        contracts: { refreshCatalog },
        frontends: {
          browse: {
            controller: { ...controller } as typeof controller,
          },
        },
        authorize: () => Effect.void,
      }),
    ).toThrow(Schema.SchemaError);
  });

  it('enforces service authorization, authoritative models, and frontend identity', () => {
    const controller = makeFrontendController({
      systemName: 'shopping',
      serviceVersion: '1.0.0',
      serviceName: 'catalog',
      name: 'browse',
      models: { product: Product },
    });
    const wrongNameController = makeFrontendController({
      systemName: 'shopping',
      serviceVersion: '1.0.0',
      serviceName: 'catalog',
      name: 'other',
      models: { product: Product },
    });
    const ProductReplica = makeReplica({
      sourceModel: Product,
      modelVersion: Product.version,
      serviceName: 'catalog',
    });

    expect(() =>
      // @ts-expect-error service frontends require owner authorization
      makeService({
        name: 'catalog',
        version: '1.0.0',
        models: { product: Product },
        contracts: {},
        frontends: { browse: { controller } },
      }),
    ).toThrow(/authorize must be a function when the service has frontends/);
    expect(() =>
      makeService({
        name: 'catalog',
        version: '1.0.0',
        models: { product: Product },
        contracts: {},
        frontends: {},
        // @ts-expect-error services without frontends must omit authorization
        authorize: () => Effect.void,
      }),
    ).toThrow(/must omit authorize when it has no frontends/);
    expect(() =>
      makeService({
        name: 'catalog',
        version: '1.0.0',
        models: {
          // @ts-expect-error services require authoritative source models
          product: ProductReplica,
        },
        contracts: {},
        frontends: {},
      }),
    ).toThrow(/must be the authoritative source model, not a replica/);
    expect(() =>
      makeService({
        name: 'catalog',
        version: '1.0.0',
        models: { product: Product },
        contracts: {},
        frontends: {
          browse: {
            // @ts-expect-error the binding key must match controller.name
            controller: wrongNameController,
          },
        },
        authorize: () => Effect.void,
      }),
    ).toThrow(Schema.SchemaError);
  });

  it('requires projection adapters exactly when frontend model names diverge', () => {
    const ProductCard = modelDefinitions.makeVersion(
      modelDefinitions.makeModel({ name: 'productCard', abbreviation: 'pcd' }),
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
      models: { productCard: ProductCard },
    });

    expect(() =>
      makeService({
        name: 'catalog',
        version: '1.0.0',
        models: { product: Product },
        contracts: {},
        frontends: {
          browse: {
            controller,
            models: { productCard: 'product' },
          },
        },
        authorize: () => Effect.void,
      }),
    ).toThrow(/projectionAdapters.productCard is required/);

    const identityController = makeFrontendController({
      systemName: 'shopping',
      serviceVersion: '1.0.0',
      serviceName: 'catalog',
      name: 'browse',
      models: { product: Product },
    });
    expect(() =>
      makeService({
        name: 'catalog',
        version: '1.0.0',
        models: { product: Product },
        contracts: {},
        frontends: {
          browse: {
            controller: identityController,
            projectionAdapters: {
              // @ts-expect-error identity-bound frontend models must omit projection adapters
              product: (resource: unknown) => Effect.succeed(resource),
            },
          },
        },
        authorize: () => Effect.void,
      }),
    ).toThrow(/projectionAdapters.product must not be set/);
  });
});
