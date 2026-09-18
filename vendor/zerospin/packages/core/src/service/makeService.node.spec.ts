import { userAggregate as authenticationFixtureOwner } from '@zerospin/core/fixtures/system';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import { defineContract } from '../contracts/defineContract.ts';
import { makeContractVersion } from '../contracts/makeContractVersion.ts';
import { makeCommand } from '../makeCommand.ts';
import { defineModel } from '../models/defineModel.ts';
import { makeModelVersion } from '../models/makeModelVersion.ts';
import { makeReplica } from '../models/makeReplica.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';

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

const refreshCatalog = makeContractVersion(defineContract('refreshCatalog'), {
  payload: { reason: primitives.text() },
  version: '1.0.0',
});

describe('makeService', () => {
  it('exposes data-only exact versions and constructs typed commands', () => {
    const service = makeService({
      ...authenticationFixtureOwner.authentication,
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
        ...authenticationFixtureOwner.authentication,
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
        ...authenticationFixtureOwner.authentication,
        models: {},
        contracts: {},
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

    const service = makeService({
      ...authenticationFixtureOwner.authentication,
      name: 'catalog',
      version: '1.0.0',
      models,
      contracts,
      queries,
      authorize: () => Effect.void,
    });

    expect(service).toMatchObject({ name: 'catalog' });
    expect(service.models).not.toBe(models);
    expect(service.contracts).not.toBe(contracts);
    expect(service.models.product).toBe(Product);
    expect(service.contracts.refreshCatalog).toBe(refreshCatalog);
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

    expect(service.models).not.toHaveProperty('extra');
    expect(service.contracts).not.toHaveProperty('extra');
    expect(service.queries).not.toHaveProperty('extra');
    expect(service.queries.products.query).not.toBe(replacementQuery);
  });

  it('rejects structural copies of canonical local leaves', () => {
    expect(() =>
      makeService({
        ...authenticationFixtureOwner.authentication,
        name: 'catalog',
        version: '1.0.0',
        models: { product: { ...Product } as typeof Product },
        contracts: { refreshCatalog },
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      makeService({
        ...authenticationFixtureOwner.authentication,
        name: 'catalog',
        version: '1.0.0',
        models: { product: Product },
        contracts: {
          refreshCatalog: {
            ...refreshCatalog,
          } as typeof refreshCatalog,
        },
      }),
    ).toThrow(Schema.SchemaError);
  });

  it('allows optional authorization and rejects replica models', () => {
    const props = {
      ...authenticationFixtureOwner.authentication,
      name: 'catalog',
      version: '1.0.0',
      models: { product: Product },
      contracts: {},
    };
    expect(makeService(props).authorize).toBeUndefined();
    const authorize = () => Effect.void;
    expect(makeService({ ...props, authorize }).authorize).toBe(authorize);
    const replica = makeReplica({
      sourceModel: Product,
      modelVersion: Product.version,
      serviceName: 'catalog',
    });
    expect(() =>
      makeService({
        ...props,
        models: {
          // @ts-expect-error Services require authoritative source models.
          product: replica,
        },
      }),
    ).toThrow(/must be the authoritative source model, not a replica/);
  });
});
