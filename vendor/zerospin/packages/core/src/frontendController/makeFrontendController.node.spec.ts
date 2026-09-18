import { main as authenticationFixtureFrontend } from '@zerospin/core/fixtures/system';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { defineContract } from '../contracts/defineContract.ts';
import { makeContractVersion } from '../contracts/makeContractVersion.ts';
import { defineModel } from '../models/defineModel.ts';
import { makeModelVersion } from '../models/makeModelVersion.ts';

import {
  AggregateFrontendController,
  makeFrontendController,
  ServiceFrontendController,
} from './makeFrontendController.ts';

const Product = makeModelVersion(
  defineModel({ name: 'product', abbreviation: 'prd' }),
  {
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);

describe('makeFrontendController', () => {
  it('constructs canonical controller classes and rejects excess props', () => {
    const serviceController = makeFrontendController({
      authenticationSchema:
        authenticationFixtureFrontend.authentication.authenticationSchema,
      serviceVersion: '1.0.0',
      systemName: 'test-system',
      serviceName: 'catalog',
      name: 'browse',
      models: { product: Product },
    });
    const aggregateController = makeFrontendController({
      authenticationSchema:
        authenticationFixtureFrontend.authentication.authenticationSchema,
      aggregateVersion: '1.0.0',
      systemName: 'test-system',
      aggregateName: 'account',
      name: 'web',
      models: { product: Product },
      contracts: {},
    });

    expect(serviceController).toBeInstanceOf(ServiceFrontendController);
    expect(aggregateController).toBeInstanceOf(AggregateFrontendController);
    expect(() =>
      Reflect.apply(makeFrontendController, undefined, [
        {
          authenticationSchema:
            authenticationFixtureFrontend.authentication.authenticationSchema,
          ...{
            serviceVersion: '1.0.0',
            systemName: 'test-system',
            serviceName: 'catalog',
            name: 'browse',
            models: { product: Product },
            extra: true,
          },
        },
      ]),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      Reflect.apply(makeFrontendController, undefined, [
        {
          authenticationSchema:
            authenticationFixtureFrontend.authentication.authenticationSchema,
          ...{
            aggregateVersion: '1.0.0',
            systemName: 'test-system',
            aggregateName: 'account',
            name: 'web',
            models: { product: Product },
            contracts: {},
            extra: true,
          },
        },
      ]),
    ).toThrow(Schema.SchemaError);
  });

  it('requires a nonempty service version and retains it on the controller', () => {
    const props = {
      authenticationSchema:
        authenticationFixtureFrontend.authentication.authenticationSchema,
      systemName: 'test-system',
      serviceName: 'catalog',
      name: 'browse',
      models: {},
    };
    expect(() => {
      // @ts-expect-error Service controllers require an explicit version.
      makeFrontendController(props);
    }).toThrow(Schema.SchemaError);
    expect(() =>
      makeFrontendController({ ...props, serviceVersion: '' }),
    ).toThrow(Schema.SchemaError);
    expect(
      makeFrontendController({ ...props, serviceVersion: '2.0.0' })
        .serviceVersion,
    ).toBe('2.0.0');
  });

  it('requires an aggregate version and rejects the superseded controller name', () => {
    const props = {
      authenticationSchema:
        authenticationFixtureFrontend.authentication.authenticationSchema,
      systemName: 'test-system',
      aggregateName: 'account',
      name: 'web',
      models: {},
      contracts: {},
    };
    expect(() => {
      // @ts-expect-error Aggregate controllers require an explicit version.
      makeFrontendController(props);
    }).toThrow(Schema.SchemaError);
    expect(() =>
      makeFrontendController({ ...props, aggregateVersion: '' }),
    ).toThrow(Schema.SchemaError);
    const obsoleteProps = {
      ...props,
      aggregateVersion: '1.0.0',
      frontendName: 'web',
    };
    expect(() => makeFrontendController(obsoleteProps)).toThrow(
      Schema.SchemaError,
    );
    const controller = makeFrontendController({
      ...props,
      aggregateVersion: '2.0.0',
    });
    expect(controller.aggregateVersion).toBe('2.0.0');
    expect(controller.name).toBe('web');
    expect(controller).not.toHaveProperty('frontendName');
  });

  it('defaults omitted aggregate claims to aggregateId', () => {
    const controller = makeFrontendController({
      aggregateVersion: '1.0.0',
      systemName: 'test-system',
      aggregateName: 'account',
      name: 'web',
      models: {},
      contracts: {},
    });
    expect(Object.keys(controller.authentication)).toEqual([
      'authenticationSchema',
    ]);
    expect(
      Object.keys(controller.authentication.authenticationSchema.fields),
    ).toEqual(['aggregateId']);
  });

  it('owns registries, model names, and contract bindings', () => {
    const inspectGuard = () => Effect.void;
    const inspectProduct = makeContractVersion(
      defineContract('inspectProduct'),
      {
        version: '1.0.0',
        payload: {},
        guard: inspectGuard,
      },
    );
    const models = { product: Product };
    const inspectProductBinding = {
      contract: inspectProduct,
    };
    const contracts = { inspectProduct: inspectProductBinding };
    const props = {
      authenticationSchema:
        authenticationFixtureFrontend.authentication.authenticationSchema,
      aggregateVersion: '1.0.0',
      systemName: 'test-system',
      aggregateName: 'account',
      name: 'web',
      models,
      contracts,
    };

    const aggregateController = makeFrontendController(props);
    expect(aggregateController.models).not.toBe(models);
    expect(aggregateController.contracts).not.toBe(contracts);
    expect(aggregateController.contracts.inspectProduct).not.toBe(
      inspectProductBinding,
    );
    expect(aggregateController.models.product).toBe(Product);
    expect(aggregateController.contracts.inspectProduct.contract).toBe(
      inspectProduct,
    );
    expect(aggregateController.contracts.inspectProduct.contract.guard).toBe(
      inspectGuard,
    );

    Reflect.deleteProperty(models, 'product');
    Reflect.deleteProperty(contracts, 'inspectProduct');
    expect(aggregateController.models.product).toBe(Product);
    expect(aggregateController.contracts.inspectProduct.contract).toBe(
      inspectProduct,
    );
  });
});
