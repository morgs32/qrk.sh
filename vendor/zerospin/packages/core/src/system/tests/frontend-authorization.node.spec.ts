import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeSignature } from '../../authentication/makeSignature.ts';
import { makeFrontendController } from '../../frontendController/makeFrontendController.ts';
import { makeSystem } from '../makeSystem.ts';

describe('makeSystem', () => {
  it('normalizes aggregate and service frontend bindings directly', () => {
    const aggregateController = makeFrontendController({
      systemName: 'test',
      aggregateName: 'user',
      frontendName: 'web',
      models: {},
      contracts: {},
    });
    const serviceController = makeFrontendController({
      systemName: 'test',
      serviceName: 'catalog',
      frontendName: 'browse',
      models: {},
    });

    const system = makeSystem({
      name: 'test',
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
        user: {
          authorize: () => Effect.void,
          models: {},
          contracts: {},
          selections: {},
          frontends: {
            web: {
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

    const aggregateFrontend = system.aggregates.user.frontends.web;
    if (aggregateFrontend === undefined) {
      throw new Error('aggregate frontend was not normalized');
    }
    const serviceFrontend = system.services.catalog.frontends.browse;
    if (serviceFrontend === undefined) {
      throw new Error('service frontend was not normalized');
    }
    expect(aggregateFrontend.controller).toBe(aggregateController);
    expect(serviceFrontend.controller).toBe(serviceController);
  });

  it('rejects an aggregate owner without authorization when it has frontends', () => {
    const controller = makeFrontendController({
      systemName: 'test',
      aggregateName: 'user',
      frontendName: 'web',
      models: {},
      contracts: {},
    });

    expect(() =>
      makeSystem({
        name: 'test',
        version: '1.0.0',
        authentication: {
          signature: makeSignature(
            { version: '1.0.0', schema: Schema.Struct({}) },
            [],
          ),
          authenticate: () => Effect.succeed('user'),
        },
        aggregates: {
          // @ts-expect-error aggregate frontends require owner authorization
          user: {
            models: {},
            contracts: {},
            selections: {},
            frontends: { web: { controller } },
          },
        },
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      makeSystem({
        name: 'test',
        version: '1.0.0',
        authentication: {
          signature: makeSignature(
            { version: '1.0.0', schema: Schema.Struct({}) },
            [],
          ),
          authenticate: () => Effect.succeed('user'),
        },
        aggregates: {
          // @ts-expect-error aggregate frontends require owner authorization
          user: {
            models: {},
            contracts: {},
            selections: {},
            frontends: { web: { controller } },
          },
        },
      }),
    ).toThrow(/authorize must be a function when the aggregate has frontends/);
  });

  it('rejects a service owner without authorization when it has frontends', () => {
    const controller = makeFrontendController({
      systemName: 'test',
      serviceName: 'catalog',
      frontendName: 'browse',
      models: {},
    });

    expect(() =>
      makeSystem({
        name: 'test',
        version: '1.0.0',
        authentication: {
          signature: makeSignature(
            { version: '1.0.0', schema: Schema.Struct({}) },
            [],
          ),
          authenticate: () => Effect.succeed('user'),
        },
        aggregates: {},
        services: {
          // @ts-expect-error service frontends require owner authorization
          catalog: {
            models: {},
            contracts: {},
            frontends: {
              browse: { controller },
            },
          },
        },
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      makeSystem({
        name: 'test',
        version: '1.0.0',
        authentication: {
          signature: makeSignature(
            { version: '1.0.0', schema: Schema.Struct({}) },
            [],
          ),
          authenticate: () => Effect.succeed('user'),
        },
        aggregates: {},
        services: {
          // @ts-expect-error service frontends require owner authorization
          catalog: {
            models: {},
            contracts: {},
            frontends: {
              browse: { controller },
            },
          },
        },
      }),
    ).toThrow(/authorize must be a function when the service has frontends/);
  });
});
