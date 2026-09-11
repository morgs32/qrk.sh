import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import { defineCommand } from '../contracts/Command.ts';
import { makeContractVersion } from '../contracts/makeVersion.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { makeCommand } from '../makeCommand.ts';
import { makeModel, makeModelVersion } from '../models/makeModel.ts';
import { makeReplica } from '../models/makeReplica.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';

import { makeService } from './makeService.ts';
import { requireVersion as requireServiceVersion } from './requireVersion.ts';

const Product = makeModelVersion(
  makeModel({ name: 'product', abbreviation: 'prd' }),
  {
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);

const refreshCatalog = makeContractVersion(defineCommand('refreshCatalog'), {
  payload: { reason: primitives.text() },
  version: '1.0.0',
});

describe('makeService', () => {
  it('exposes data-only exact versions and constructs typed commands', () => {
    const service = makeService({
      name: 'catalog',
      version: '2.0.0',
      models: {},
      contracts: { refreshCatalog },
    });
    for (const field of [
      'makeCommand',
      'getVersion',
      'initializeGuards',
      'historicalDefinitions',
      '__initializeRequirements',
    ]) {
      expect(service).not.toHaveProperty(field);
    }
    const exact = Effect.runSync(requireServiceVersion(service, '2.0.0'));
    assert<Equals<typeof exact, typeof service>>();
    expect(exact).toBe(service);
    for (const version of ['1.0.0', '3.0.0']) {
      expect(
        Effect.runSync(
          requireServiceVersion(service, version).pipe(Effect.result),
        ),
      ).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'service-version-unsupported' },
      });
    }
    const command = Effect.runSync(
      makeCommand(service, {
        contractName: 'refreshCatalog',
        payload: { reason: 'seed' },
      }).pipe(Effect.provide(makePrefixedIncrementalIdFactory('service'))),
    );
    assert<Equals<typeof command.serviceName, 'catalog'>>();
    assert<Equals<typeof command.contractVersion, '1.0.0'>>();
    assert<Equals<typeof command.payload.reason, string>>();
    expect(command).toMatchObject({
      serviceName: 'catalog',
      serviceVersion: '2.0.0',
      contractVersion: '1.0.0',
      payload: { reason: 'seed' },
    });

    expect(
      Effect.runSync(
        // @ts-expect-error The selected contract requires a string reason.
        makeCommand(service, {
          contractName: 'refreshCatalog',
          payload: { reason: 123 },
        }).pipe(
          Effect.provide(makePrefixedIncrementalIdFactory('invalid')),
          Effect.result,
        ),
      ),
    ).toMatchObject({ _tag: 'Failure' });
    Reflect.deleteProperty(service.contracts, 'refreshCatalog');
    expect(
      Effect.runSync(
        makeCommand(service, {
          contractName: 'refreshCatalog',
          payload: { reason: 'missing' },
        }).pipe(
          Effect.provide(makePrefixedIncrementalIdFactory('missing')),
          Effect.result,
        ),
      ),
    ).toMatchObject({ _tag: 'Failure' });
  });

  it('rejects removed service history authoring', () => {
    expect(() =>
      makeService({
        name: 'catalog',
        version: '2.0.0',
        models: {},
        contracts: {},
        // @ts-expect-error Service versions are registered as independent definitions.
        historicalDefinitions: [],
      }),
    ).toThrow(Schema.SchemaError);
  });

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
    const ProductCard = makeModelVersion(
      makeModel({ name: 'productCard', abbreviation: 'pcd' }),
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
