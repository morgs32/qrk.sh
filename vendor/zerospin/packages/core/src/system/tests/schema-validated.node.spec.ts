import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeSignature } from '../../authentication/makeSignature.ts';
import { makeContract } from '../../contracts/makeContract.ts';
import { makeFrontendController } from '../../frontendController/makeFrontendController.ts';
import { makeModel } from '../../models/makeModel.ts';
import { makeReplica } from '../../models/makeReplica.ts';
import { makeSelection } from '../../models/makeSelection.ts';
import { makeSystem } from '../makeSystem.ts';
import { makeSystemSpec } from '../makeSystemSpec.ts';

const authentication = {
  signature: makeSignature(
    { version: '1.0.0', schema: Schema.Struct({}) },
    [],
  ),
  authenticate: () => Effect.succeed('user'),
};

const Item = makeModel(
  {
    abbreviation: 'itm',
    modelName: 'item',
    attributes: { amount: primitives.integer() },
    indexes: [],
    version: '2.0.0',
  },
  [
    {
      abbreviation: 'itm',
      modelName: 'item',
      attributes: { quantity: primitives.integer() },
      indexes: [],
      version: '1.0.0',
      adaptResource: ({ resource }) =>
        Effect.succeed({
          id: resource.id,
          modelName: resource.modelName,
          createdAt: resource.createdAt,
          updatedAt: resource.updatedAt,
          version: '1.0.0',
          quantity: resource.amount,
        }),
    },
  ],
);

const Note = makeModel({
  abbreviation: 'nte',
  modelName: 'note',
  attributes: { body: primitives.text() },
  indexes: [],
  version: '1.0.0',
});

const Retired = makeModel({
  abbreviation: 'rtd',
  modelName: 'retired',
  attributes: { body: primitives.text() },
  indexes: [],
  version: '1.0.0',
});

const renameItem = makeContract({
  commandName: 'renameItem',
  payload: {
    id: Item.primaryKey({ autogenerate: false }),
    amount: primitives.integer(),
  },
  mutations: Schema.Struct({
    updated: Item.updateMutation('2.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      updated: Item.update('2.0.0', {
        resourceId: payload.id,
        attributes: { amount: payload.amount },
      }),
    }),
  version: '1.0.0',
});

describe('makeSystem schema validation', () => {
  it('rejects structural copies of canonical leaves', () => {
    const controller = makeFrontendController({
      systemName: 'copy-system',
      aggregateName: 'list',
      frontendName: 'web',
      models: { item: Item },
      contracts: { renameItem },
    });

    expect(() =>
      makeSystem({
        name: 'copy-system',
        version: '1.0.0',
        authentication: {
          ...authentication,
          signature: {
            ...authentication.signature,
          } as typeof authentication.signature,
        },
        aggregates: {
          list: {
            authorize: () => Effect.void,
            models: { item: Item },
            contracts: { renameItem },
            selections: {
              item: makeSelection({ model: Item, where: () => ({}) }),
            },
            frontends: { web: { controller } },
          },
        },
      }),
    ).toThrow(Schema.SchemaError);

    expect(() =>
      makeSystem({
        name: 'copy-system',
        version: '1.0.0',
        authentication,
        aggregates: {
          list: {
            authorize: () => Effect.void,
            models: { item: { ...Item } as typeof Item },
            contracts: { renameItem },
            selections: {
              item: makeSelection({ model: Item, where: () => ({}) }),
            },
            frontends: { web: { controller } },
          },
        },
      }),
    ).toThrow(Schema.SchemaError);

    expect(() =>
      makeSystem({
        name: 'copy-system',
        version: '1.0.0',
        authentication,
        aggregates: {
          list: {
            authorize: () => Effect.void,
            models: { item: Item },
            contracts: { renameItem: { ...renameItem } as typeof renameItem },
            selections: {
              item: makeSelection({ model: Item, where: () => ({}) }),
            },
            frontends: { web: { controller } },
          },
        },
      }),
    ).toThrow(Schema.SchemaError);

    expect(() =>
      makeSystem({
        name: 'copy-system',
        version: '1.0.0',
        authentication,
        aggregates: {
          list: {
            authorize: () => Effect.void,
            models: { item: Item },
            contracts: { renameItem },
            selections: {
              item: makeSelection({ model: Item, where: () => ({}) }),
            },
            frontends: {
              web: { controller: { ...controller } as typeof controller },
            },
          },
        },
      }),
    ).toThrow(Schema.SchemaError);
  });

  it('keeps canonical leaf identity and snapshots authored containers', () => {
    const models = { item: Item };
    const contracts = { renameItem };
    const controller = makeFrontendController({
      systemName: 'identity-system',
      aggregateName: 'list',
      frontendName: 'web',
      models,
      contracts,
    });
    const frontends = { web: { controller } };
    const system = makeSystem({
      name: 'identity-system',
      version: '1.0.0',
      authentication,
      aggregates: {
        list: {
          authorize: () => Effect.void,
          models,
          contracts,
          selections: {
            item: makeSelection({ model: Item, where: () => ({}) }),
          },
          frontends,
        },
      },
    });

    expect(system.aggregates.list.models.item).toBe(Item);
    expect(system.aggregates.list.contracts.renameItem).toBe(renameItem);
    expect(system.aggregates.list.frontends.web?.controller).toBe(controller);
    expect(system.aggregates.list.models).not.toBe(models);
    expect(system.aggregates.list.contracts).not.toBe(contracts);
    expect(system.aggregates.list.frontends).not.toBe(frontends);

    const extra = makeModel({
      abbreviation: 'xtr',
      modelName: 'extra',
      attributes: { name: primitives.text() },
      indexes: [],
      version: '1.0.0',
    });
    Object.assign(models, { extra });
    Object.assign(contracts, { extra: renameItem });
    Reflect.deleteProperty(frontends, 'web');

    expect(system.aggregates.list.models.item).toBe(Item);
    expect(system.aggregates.list.models).not.toHaveProperty('extra');
    expect(system.aggregates.list.contracts).not.toHaveProperty('extra');
    expect(system.aggregates.list.frontends.web?.controller).toBe(controller);
  });

  it('rejects authentication, ownership, replica, frontend, stamping, and authorization failures as Schema errors', () => {
    const Product = makeModel({
      abbreviation: 'prd',
      modelName: 'product',
      attributes: { name: primitives.text() },
      indexes: [],
      version: '1.0.0',
    });
    const ProductReplica = makeReplica({
      sourceModel: Product,
      serviceName: 'catalog',
    });
    const serviceController = makeFrontendController({
      systemName: 'graph-system',
      serviceName: 'catalog',
      frontendName: 'browse',
      models: { product: Product },
    });
    const aggregateController = makeFrontendController({
      systemName: 'graph-system',
      aggregateName: 'account',
      frontendName: 'web',
      models: { product: ProductReplica },
      contracts: {},
    });
    const stampedWrong = makeFrontendController({
      systemName: 'other-system',
      aggregateName: 'account',
      frontendName: 'web',
      models: { product: ProductReplica },
      contracts: {},
    });

    expect(() =>
      makeSystem({
        name: 'graph-system',
        version: '1.0.0',
        authentication: {
          signature: {
            ...authentication.signature,
          } as typeof authentication.signature,
          authenticate: authentication.authenticate,
        },
        aggregates: {},
      }),
    ).toThrow(Schema.SchemaError);

    expect(() =>
      makeSystem({
        name: 'graph-system',
        version: '1.0.0',
        authentication,
        aggregates: {},
        services: {
          catalog: {
            // @ts-expect-error services require authoritative models
            models: { product: ProductReplica },
            contracts: {},
            frontends: {},
          },
        },
      }),
    ).toThrow(Schema.SchemaError);

    expect(() =>
      makeSystem({
        name: 'graph-system',
        version: '1.0.0',
        authentication,
        aggregates: {
          account: {
            models: { product: Product },
            contracts: {},
            selections: {},
            frontends: {},
          },
        },
        services: {
          catalog: {
            models: { product: Product },
            contracts: {},
            frontends: {},
          },
        },
      }),
    ).toThrow(Schema.SchemaError);

    expect(() =>
      makeSystem({
        name: 'graph-system',
        version: '1.0.0',
        authentication,
        aggregates: {
          account: {
            authorize: () => Effect.void,
            models: { product: ProductReplica },
            contracts: {},
            selections: {
              product: makeSelection({
                model: ProductReplica,
                where: () => ({}),
              }),
            },
            frontends: { web: { controller: stampedWrong as never } },
          },
        },
        services: {
          catalog: {
            models: { product: Product },
            contracts: {},
            frontends: {},
          },
        },
      }),
    ).toThrow(Schema.SchemaError);

    expect(() =>
      makeSystem({
        name: 'graph-system',
        version: '1.0.0',
        authentication,
        aggregates: {
          // @ts-expect-error aggregate frontends require owner authorization
          account: {
            models: { product: ProductReplica },
            contracts: {},
            selections: {
              product: makeSelection({
                model: ProductReplica,
                where: () => ({}),
              }),
            },
            frontends: { web: { controller: aggregateController } },
          },
        },
        services: {
          // @ts-expect-error service frontends require owner authorization
          catalog: {
            models: { product: Product },
            contracts: {},
            frontends: { browse: { controller: serviceController } },
          },
        },
      }),
    ).toThrow(Schema.SchemaError);
  });

  it('rejects mutation-history invariants as Schema errors', () => {
    const validAdapter = {
      source: Item.updateMutation('1.0.0'),
      destination: Item.updateMutation('2.0.0'),
      adapter: (mutation: {
        resourceId: `itm_${string}`;
        operation: { attributes: { quantity: number } };
      }) =>
        Item.update('2.0.0', {
          resourceId: mutation.resourceId,
          attributes: { amount: mutation.operation.attributes.quantity },
        }),
    };

    const expectMutationError = (
      mutationAdapters: unknown,
      message: RegExp,
    ) => {
      const run = () =>
        makeSystem({
          name: 'mutation-system',
          version: '1.0.0',
          authentication,
          aggregates: {
            list: {
              models: { item: Item },
              contracts: {},
              mutationAdapters: mutationAdapters as never,
              selections: {
                item: makeSelection({ model: Item, where: () => ({}) }),
              },
              frontends: {},
            },
          },
        });
      expect(run).toThrow(Schema.SchemaError);
      expect(run).toThrow(message);
    };

    expectMutationError(
      {
        item: {
          update: [{ source: Schema.Struct({}), destination: null }],
        },
      },
      /has no mutation identity/,
    );
    expectMutationError(
      {
        item: {
          patch: [validAdapter],
        },
      },
      /is not a supported mutation operation/,
    );
    expectMutationError(
      {
        item: {
          update: [
            {
              source: Item.updateMutation('2.0.0'),
              destination: Item.updateMutation('2.0.0'),
              adapter: validAdapter.adapter,
            },
          ],
        },
      },
      /source version "2.0.0" is current/,
    );
    expectMutationError(
      {
        item: {
          update: [
            {
              source: Item.updateMutation('1.0.0'),
              destination: Item.updateMutation('1.0.0'),
              adapter: validAdapter.adapter,
            },
          ],
        },
      },
      /is not current version "2.0.0"/,
    );
    expectMutationError(
      {
        item: {
          update: [validAdapter, validAdapter],
        },
      },
      /repeats source version "1.0.0"/,
    );
    expectMutationError(
      {
        item: {
          update: [
            {
              source: Item.updateMutation('1.0.0'),
              destination: Note.updateMutation('1.0.0'),
              adapter: validAdapter.adapter,
            },
          ],
        },
      },
      /destination model "note" is not an aggregate model/,
    );
    expectMutationError(
      {
        retired: {
          create: [
            { source: Retired.createMutation('1.0.0'), destination: null },
          ],
        },
      },
      /retired model "retired" must exhaustively adapt or discard every create\/update\/delete\/move source version/,
    );
  });

  it('preserves valid specs and stamped owner identities', () => {
    const controller = makeFrontendController({
      systemName: 'valid-system',
      aggregateName: 'list',
      frontendName: 'web',
      models: { item: Item },
      contracts: { renameItem },
    });
    const system = makeSystem({
      name: 'valid-system',
      version: '1.0.0',
      authentication,
      aggregates: {
        list: {
          authorize: () => Effect.void,
          models: { item: Item },
          contracts: { renameItem },
          mutationAdapters: {
            item: {
              update: [
                {
                  source: Item.updateMutation('1.0.0'),
                  destination: Item.updateMutation('2.0.0'),
                  adapter: mutation =>
                    Item.update('2.0.0', {
                      resourceId: mutation.resourceId,
                      attributes: {
                        amount: mutation.operation.attributes.quantity,
                      },
                    }),
                },
              ],
            },
          },
          selections: {
            item: makeSelection({ model: Item, where: () => ({}) }),
          },
          queries: {
            products: { service: 'catalog', query: 'products' },
          },
          frontends: { web: { controller } },
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

    expect(system.aggregates.list.name).toBe('list');
    expect(system.services.catalog.name).toBe('catalog');
    expect(system.aggregates.list.queries.products).toBe(
      system.services.catalog.queries.products,
    );
    expect(makeSystemSpec({ system })).toMatchObject({
      systemName: 'valid-system',
      version: '1.0.0',
      aggregates: {
        list: {
          name: 'list',
        },
      },
      services: {
        catalog: {
          name: 'catalog',
        },
      },
    });
  });
});
