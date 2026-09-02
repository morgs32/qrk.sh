import { primitives } from '@zerospin/schema';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeModel } from '../models/makeModel.ts';

import {
  AggregateFrontendController,
  makeFrontendController,
  ServiceFrontendController,
} from './makeFrontendController.ts';

const Product = makeModel({
  abbreviation: 'prd',
  modelName: 'product',
  attributes: { name: primitives.text() },
  indexes: [],
  version: '1.0.0',
});

describe('makeFrontendController', () => {
  it('constructs canonical controller classes and rejects excess props', () => {
    const serviceController = makeFrontendController({
      systemName: 'test-system',
      serviceName: 'catalog',
      frontendName: 'browse',
      models: { product: Product },
    });
    const aggregateController = makeFrontendController({
      systemName: 'test-system',
      aggregateName: 'account',
      frontendName: 'web',
      models: { product: Product },
      contracts: {},
    });

    expect(serviceController).toBeInstanceOf(ServiceFrontendController);
    expect(aggregateController).toBeInstanceOf(AggregateFrontendController);
    expect(() =>
      makeFrontendController({
        systemName: 'test-system',
        serviceName: 'catalog',
        frontendName: 'browse',
        models: { product: Product },
        extra: true,
      } as {
        systemName: string;
        serviceName: string;
        frontendName: string;
        models: { product: typeof Product };
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      makeFrontendController({
        systemName: 'test-system',
        aggregateName: 'account',
        frontendName: 'web',
        models: { product: Product },
        contracts: {},
        extra: true,
      } as {
        systemName: string;
        aggregateName: string;
        frontendName: string;
        models: { product: typeof Product };
        contracts: Record<string, never>;
      }),
    ).toThrow(Schema.SchemaError);
  });
});
