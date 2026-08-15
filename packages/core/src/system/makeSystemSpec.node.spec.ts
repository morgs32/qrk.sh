import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeSignature } from '../authentication/makeSignature.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';

import { makeSystem } from './makeSystem.ts';
import { makeSystemSpec } from './makeSystemSpec.ts';

describe('makeSystemSpec', () => {
  it('serializes the consolidated aggregate and service hierarchy', () => {
    const aggregateController = makeFrontendController({
      systemName: 'shopping',
      aggregateName: 'cart',
      frontendName: 'checkout',
      models: {},
      contracts: {},
    });
    const serviceController = makeFrontendController({
      systemName: 'shopping',
      serviceName: 'catalog',
      frontendName: 'browse',
      models: {},
    });
    const system = makeSystem({
      name: 'shopping',
      version: '1.0.0',
      authentication: {
        signature: makeSignature(
          {
            version: '1.0.0',
            schema: Schema.Struct({ userId: Schema.NonEmptyString }),
          },
          [],
        ),
        authenticate: ({ signature }) => Effect.succeed(signature.userId),
      },
      aggregates: {
        cart: {
          authorize: () => Effect.void,
          models: {},
          contracts: {},
          selections: {},
          frontends: {
            checkout: {
              controller: aggregateController,
            },
          },
        },
      },
      services: {
        catalog: {
          authorize: () => Effect.void,
          models: {},
          contracts: {},
          frontends: {
            browse: {
              controller: serviceController,
            },
          },
        },
      },
    });

    expect(makeSystemSpec({ system })).toMatchObject({
      systemName: 'shopping',
      version: '1.0.0',
      authentication: {
        signature: {
          version: '1.0.0',
          historicalDefinitions: [],
        },
      },
      aggregates: {
        cart: {
          name: 'cart',
          models: {},
          contracts: {},
          selections: {},
          queries: {},
          frontends: {
            checkout: {
              name: 'checkout',
              models: {},
              controller: {
                kind: 'aggregate',
                aggregateName: 'cart',
                frontendName: 'checkout',
              },
            },
          },
        },
      },
      services: {
        catalog: {
          name: 'catalog',
          models: {},
          contracts: {},
          queries: {},
          frontends: {
            browse: {
              name: 'browse',
              models: {},
              controller: {
                kind: 'service',
                serviceName: 'catalog',
                frontendName: 'browse',
              },
            },
          },
        },
      },
    });
  });
});
