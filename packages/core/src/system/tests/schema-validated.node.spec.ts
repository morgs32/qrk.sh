import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { aggregates } from '../../aggregate/index.ts';
import { authentication } from '../../authentication/index.ts';
import { contracts } from '../../contracts/index.ts';
import { makeFrontendController } from '../../frontendController/makeFrontendController.ts';
import { models } from '../../models/index.ts';
import { makeSelection } from '../../models/makeSelection.ts';
import { makeService } from '../../service/makeService.ts';
import { makeSystem } from '../makeSystem.ts';
import { makeSystemSpec } from '../makeSystemSpec.ts';
import { ZerospinConfigSchema } from '../ZerospinConfigSchema.ts';

const authenticationV1 = authentication.makeVersion({
  version: '1.0.0',
  signature: Schema.Struct({}),
  authenticate: () => Effect.succeed('user'),
});

const ItemModel = models.makeModel({ name: 'item', abbreviation: 'itm' });

const Item = models.makeVersion(ItemModel, {
  attributes: { amount: primitives.integer() },
  indexes: [],
  version: '2.0.0',
});

const renameItem = contracts.makeVersion(contracts.makeCommand('renameItem'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: ItemModel.abbreviation }),
    amount: primitives.integer(),
  },
  models: { item: Item },
  program: ({ payload, models }) =>
    Effect.all({
      updated: models.item.update({
        resourceId: payload.id,
        attributes: { amount: payload.amount },
      }),
    }),
  version: '1.0.0',
});

describe('makeSystem schema validation', () => {
  it('accepts a deployment config for an aggregate-free System', () => {
    const system = makeSystem({
      name: 'empty',
      authentication: [authenticationV1],
      aggregates: {},
    });
    const config = system.config({ systemId: 'sys_config_test' });
    expect(config.system).toBe(system);
    expect(config).toEqual({ system, systemId: 'sys_config_test' });
    expectTypeOf(config.system.name).toEqualTypeOf<'empty'>();
    expect(Schema.is(ZerospinConfigSchema)(config)).toBe(true);
    expect(Schema.is(ZerospinConfigSchema)({ system })).toBe(false);
    for (const systemId of ['', 'shopping', null, 42]) {
      expect(Schema.is(ZerospinConfigSchema)({ system, systemId })).toBe(false);
    }
    expect(
      Schema.is(ZerospinConfigSchema)({
        ...config,
        aggregates: { unknown: { canonical: '1.0.0' } },
      }),
    ).toBe(false);
  });
  it('rejects structural copies of canonical authentication and owner factories', () => {
    const aggregate = aggregates.makeVersion(
      aggregates.makeAggregate({ name: 'list' }),
      {
        version: '1.0.0',
        models: {},
        contracts: {},
        selections: {},
      },
    );
    const service = makeService({
      name: 'catalog',
      version: '1.0.0',
      models: {},
      contracts: {},
      frontends: {},
    });

    expect(() =>
      makeSystem({
        name: 'copy-system',
        authentication: [{ ...authenticationV1 }],
        aggregates: { list: [aggregate] },
        services: { catalog: [service] },
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      makeSystem({
        name: 'copy-system',
        authentication: [authenticationV1],
        aggregates: {
          list: [{ ...aggregate } as typeof aggregate],
        },
        services: { catalog: [service] },
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      makeSystem({
        name: 'copy-system',
        authentication: [authenticationV1],
        aggregates: { list: [aggregate] },
        services: {
          catalog: [{ ...service } as typeof service],
        },
      }),
    ).toThrow(Schema.SchemaError);
  });

  it('preserves service identity and canonical aggregate definitions', () => {
    const service = makeService({
      name: 'catalog',
      version: '1.0.0',
      models: {},
      contracts: {},
      queries: {
        products: {
          paramsSchema: Schema.Struct({}),
          query: () => Effect.succeed([]),
        },
      },
      frontends: {},
    });
    const aggregate = aggregates.makeVersion(
      aggregates.makeAggregate({ name: 'list' }),
      {
        version: '1.0.0',
        authorize: () => Effect.void,
        models: { item: Item },
        contracts: { renameItem: { contract: renameItem } },
        selections: {
          item: makeSelection({ model: Item, where: () => ({}) }),
        },
      },
    );

    const aggregateDefinitions = { list: [aggregate] };
    const serviceDefinitions = { catalog: [service] };
    const system = makeSystem({
      name: 'identity-system',
      authentication: [authenticationV1],
      aggregates: aggregateDefinitions,
      services: serviceDefinitions,
    });

    expect(system.services.catalog['1.0.0']).toBe(service);
    expect(system.aggregates.list).not.toBe(aggregate);
    expect(system.aggregates.list['1.0.0'].models).toBe(aggregate.models);
    expect(system.aggregates.list['1.0.0'].contracts).toBe(aggregate.contracts);
    expect(system.aggregates.list['1.0.0'].selections).toBe(
      aggregate.selections,
    );
    expect(system.aggregates.list['1.0.0'].models.item).toBe(Item);
    expect(system.aggregates.list['1.0.0'].contracts.renameItem.contract).toBe(
      renameItem,
    );
  });

  it('rejects owner key/name and frontend systemName mismatches as Schema errors', () => {
    const aggregate = aggregates.makeVersion(
      aggregates.makeAggregate({ name: 'account' }),
      {
        version: '1.0.0',
        models: {},
        contracts: {},
        selections: {},
      },
    );
    const service = makeService({
      name: 'catalog',
      version: '1.0.0',
      models: {},
      contracts: {},
      frontends: {},
    });

    expect(() =>
      makeSystem({
        name: 'graph-system',
        authentication: [authenticationV1],
        aggregates: {
          // @ts-expect-error aggregate registry keys must equal aggregate.name
          other: [aggregate],
        },
        services: { catalog: [service] },
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      makeSystem({
        name: 'graph-system',
        authentication: [authenticationV1],
        aggregates: { account: [aggregate] },
        services: {
          // @ts-expect-error service registry keys must equal service.name
          other: [service],
        },
      }),
    ).toThrow(Schema.SchemaError);

    const wrongServiceController = makeFrontendController({
      systemName: 'other-system',
      serviceVersion: '1.0.0',
      serviceName: 'catalog',
      name: 'browse',
      models: {},
    });
    const wrongServiceSystem = makeService({
      name: 'catalog',
      version: '1.0.0',
      authorize: () => Effect.void,
      models: {},
      contracts: {},
      frontends: {
        browse: {
          controller: wrongServiceController,
        },
      },
    });

    expect(() =>
      makeSystem({
        name: 'graph-system',
        authentication: [authenticationV1],
        aggregates: { account: [aggregate] },
        services: {
          catalog: [wrongServiceSystem],
        },
      }),
    ).toThrow(Schema.SchemaError);
  });

  it('preserves valid specs and stamped owner identities', () => {
    const aggregate = aggregates.makeVersion(
      aggregates.makeAggregate({ name: 'list' }),
      {
        version: '1.0.0',
        authorize: () => Effect.void,
        models: { item: Item },
        contracts: { renameItem: { contract: renameItem } },
        selections: {
          item: makeSelection({ model: Item, where: () => ({}) }),
        },
      },
    );
    const service = makeService({
      name: 'catalog',
      version: '1.0.0',
      models: {},
      contracts: {},
      queries: {
        products: {
          paramsSchema: Schema.Struct({}),
          query: () => Effect.succeed([]),
        },
      },
      frontends: {},
    });
    const system = makeSystem({
      name: 'valid-system',
      authentication: [authenticationV1],
      aggregates: { list: [aggregate] },
      services: { catalog: [service] },
    });

    expect(system.aggregates.list['1.0.0'].name).toBe('list');
    expect(system.services.catalog['1.0.0'].name).toBe('catalog');
    expect(makeSystemSpec({ system })).toMatchObject({
      systemName: 'valid-system',
      aggregates: {
        list: { '1.0.0': { name: 'list' } },
      },
      services: {
        catalog: { '1.0.0': { name: 'catalog' } },
      },
    });
  });
});
