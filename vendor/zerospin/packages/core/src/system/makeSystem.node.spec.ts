import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeSignature } from '../authentication/makeSignature.ts';
import { makeContract } from '../contracts/makeContract.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { makeGuard } from '../guards/makeGuard.ts';
import { makeModel } from '../models/makeModel.ts';
import { makeSelection } from '../models/makeSelection.ts';
import { primitives } from '../models/primitives.ts';

import { makeSystem } from './makeSystem.ts';

describe('makeSystem', () => {
  it('normalizes aggregate and service definitions under their registry keys', () => {
    const system = makeSystem({
      name: 'test',
      version: '1.2.3',
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
          models: {},
          contracts: {},
          selections: {},
          frontends: {},
        },
      },
      services: {
        catalog: {
          models: {},
          contracts: {},
          frontends: {},
        },
      },
    });

    expect(system.name).toBe('test');
    expect(system.version).toBe('1.2.3');
    expect(system.aggregates.user.name).toBe('user');
    expect(system.services.catalog.name).toBe('catalog');
  });

  it('resolves aggregate query grants directly to service queries', () => {
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
          models: {},
          contracts: {},
          selections: {},
          queries: {
            products: { service: 'catalog', query: 'products' },
          },
          frontends: {},
        },
      },
      services: {
        catalog: {
          models: {},
          contracts: {},
          queries: {
            products: {
              paramsSchema: Schema.Struct({}),
              query: () => Effect.succeed([]),
            },
          },
          frontends: {},
        },
      },
    });

    expect(system.aggregates.user.queries.products).toBe(
      system.services.catalog.queries.products,
    );
    expect(system.aggregates.user.queries.products).toMatchObject({
      kind: 'service',
      name: 'products',
      serviceName: 'catalog',
    });
  });

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

    expect(system.aggregates.user.frontends.web.controller).toBe(
      aggregateController,
    );
    expect(system.services.catalog.frontends.browse.controller).toBe(
      serviceController,
    );
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
    ).toThrow(
      'makeSystem: aggregates.user.authorize must be a function when the aggregate has frontends',
    );
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
    ).toThrow(
      'makeSystem: services.catalog.authorize must be a function when the service has frontends',
    );
  });

  it('rejects an empty system version', () => {
    expect(() =>
      makeSystem({
        name: 'test',
        version: '',
        authentication: {
          signature: makeSignature(
            { version: '1.0.0', schema: Schema.Struct({}) },
            [],
          ),
          authenticate: () => Effect.succeed('user'),
        },
        aggregates: {},
      }),
    ).toThrow('makeSystem: version must be a non-empty string');
  });

  it('retains guards bound to the authoritative aggregate model identity', () => {
    const Item = makeModel(
      {
        abbreviation: 'git',
        modelName: 'guardItem',
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
      [],
    );
    const renameItem = makeContract({
      commandName: 'renameItem',
      payload: {
        id: Item.primaryKey({ autogenerate: false }),
        name: primitives.text(),
      },
      mutations: Schema.Struct({
        updated: Item.updateMutation('1.0.0'),
      }),
      program: ({ payload }) =>
        Effect.all({
          updated: Item.update('1.0.0', {
            resourceId: payload.id,
            attributes: { name: payload.name },
          }),
        }),
      version: '1.0.0',
    });
    const guard = makeGuard({
      contract: renameItem,
      models: { guardItem: Item },
      program: () => Effect.void,
    });
    const controller = makeFrontendController({
      systemName: 'guard-system',
      aggregateName: 'account',
      frontendName: 'web',
      contracts: { renameItem },
      models: { guardItem: Item },
      guards: { renameItem: [guard] },
    });

    const system = makeSystem({
      name: 'guard-system',
      version: '1.0.0',
      authentication: {
        signature: makeSignature(
          { version: '1.0.0', schema: Schema.Struct({}) },
          [],
        ),
        authenticate: () => Effect.succeed('user'),
      },
      aggregates: {
        account: {
          authorize: () => Effect.void,
          models: { guardItem: Item },
          contracts: { renameItem },
          selections: {
            guardItem: makeSelection({ model: Item, where: () => ({}) }),
          },
          frontends: { web: { controller } },
        },
      },
    });

    expect(system.aggregates.account.frontends.web.controller.guards).toEqual({
      renameItem: [guard],
    });
    expect(guard.models.guardItem).toBe(Item);
  });

  it('rejects guards that query a projected frontend model identity', () => {
    const Command = makeModel(
      {
        abbreviation: 'gcm',
        modelName: 'guardCommand',
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
      [],
    );
    const Source = makeModel(
      {
        abbreviation: 'gsc',
        modelName: 'guardSource',
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
      [],
    );
    const Projected = makeModel(
      {
        abbreviation: 'gpr',
        modelName: 'guardProjected',
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
      [],
    );
    const createCommand = makeContract({
      commandName: 'createCommand',
      payload: {
        id: Command.primaryKey({ autogenerate: false }),
        name: primitives.text(),
      },
      mutations: Schema.Struct({
        created: Command.createMutation('1.0.0'),
      }),
      program: ({ payload }) =>
        Effect.all({
          created: Command.create('1.0.0', {
            resourceId: payload.id,
            attributes: { name: payload.name },
          }),
        }),
      version: '1.0.0',
    });
    const guard = makeGuard({
      contract: createCommand,
      models: { guardProjected: Projected },
      program: () => Effect.void,
    });
    const controller = makeFrontendController({
      systemName: 'guard-projection-system',
      aggregateName: 'account',
      frontendName: 'web',
      contracts: { createCommand },
      models: { guardCommand: Command, guardProjected: Projected },
      guards: { createCommand: [guard] },
    });

    expect(() =>
      makeSystem({
        name: 'guard-projection-system',
        version: '1.0.0',
        authentication: {
          signature: makeSignature(
            { version: '1.0.0', schema: Schema.Struct({}) },
            [],
          ),
          authenticate: () => Effect.succeed('user'),
        },
        aggregates: {
          account: {
            authorize: () => Effect.void,
            models: { guardCommand: Command, guardSource: Source },
            contracts: { createCommand },
            selections: {
              guardCommand: makeSelection({
                model: Command,
                where: () => ({}),
              }),
              guardSource: makeSelection({
                model: Source,
                where: () => ({}),
              }),
            },
            frontends: {
              web: {
                controller,
                models: {
                  guardCommand: 'guardCommand',
                  guardProjected: 'guardSource',
                },
                projectionAdapters: {
                  guardProjected: resource =>
                    Effect.succeed({
                      ...resource,
                      id: Projected.prefixId(resource.id),
                      modelName: Projected.modelName,
                      version: Projected.version,
                    }),
                },
              },
            },
          },
        },
      }),
    ).toThrow(
      'guards.createCommand.0.models.guardProjected must be identity-bound to authoritative aggregate model "guardProjected"',
    );
  });
});
