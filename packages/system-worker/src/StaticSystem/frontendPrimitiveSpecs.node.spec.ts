import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import {
  AggregateFrontendLockSchema,
  makeAggregateFrontendLock,
} from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import {
  makeServiceFrontendLock,
  ServiceFrontendLockSchema,
} from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { Effect, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { SelectedAggregateFrontendLockSchema } from './frontendSpecSchemas.ts';
import { validateAggregateFrontendLock } from './validateAggregateFrontendLock/validateAggregateFrontendLock.ts';
import { validateServiceFrontendLock } from './validateServiceFrontendLock/validateServiceFrontendLock.ts';

const fixtures = await vi.hoisted(async () => {
  const { models } = await import('@zerospin/core/models/index');
  const { contracts } = await import('@zerospin/core/contracts/index');
  const { makeFrontendController } =
    await import('@zerospin/core/frontendController/makeFrontendController');
  const { primitives } = await import('@zerospin/schema');
  const { Schema } = await import('effect');
  const item = models.makeVersion(
    models.makeModel({ name: 'item', abbreviation: 'itm' }),
    {
      version: '1.0.0',
      indexes: [],
      attributes: {
        title: primitives.text(),
        dueAt: primitives.date({
          defaultValue: new Date('2026-09-01T00:00:00.000Z'),
        }),
        settings: primitives.json({
          schema: Schema.Struct({ compact: Schema.Boolean }),
        }),
      },
    },
  );
  const update = contracts.makeVersion(contracts.makeCommand('update'), {
    models: { item },
    version: '1.0.0',
    payload: {
      title: primitives.text(),
      settings: primitives.json({
        schema: Schema.Struct({ compact: Schema.Boolean }),
      }),
    },
  });
  const aggregateController = makeFrontendController({
    systemName: 'test',
    aggregateName: 'shopper',
    aggregateVersion: '1.0.0',
    name: 'web',
    models: { item },
    contracts: { update: { contract: update } },
  });
  const serviceController = makeFrontendController({
    systemName: 'test',
    serviceVersion: '1.0.0',
    serviceName: 'catalog',
    name: 'web',
    models: { item },
  });
  return {
    aggregateController,
    serviceController,
    system: {
      name: 'test',
      aggregates: {
        shopper: {
          '1.0.0': {
            models: aggregateController.models,
            contracts: aggregateController.contracts,
          },
        },
      },
      services: {
        catalog: {
          '1.0.0': { frontends: { web: { controller: serviceController } } },
        },
      },
    },
  };
});

vi.mock('system', () => ({ system: fixtures.system }));

describe('frontend primitive specs', () => {
  it('accepts exact subsets for unregistered frontend names and rejects missing mutation models', async () => {
    const baseline = makeAggregateFrontendLock({
      frontend: fixtures.aggregateController,
    });
    const lock = { ...baseline, frontendName: 'another-web', contracts: {} };
    await expect(
      Effect.runPromise(
        validateAggregateFrontendLock({
          aggregateName: 'shopper',
          aggregateVersion: '1.0.0',
          frontendName: 'another-web',
          aggregateFrontendLock: lock,
        }),
      ),
    ).resolves.toMatchObject({ aggregateFrontendLock: lock });
    await expect(
      Effect.runPromise(
        validateAggregateFrontendLock({
          aggregateName: 'shopper',
          aggregateVersion: '1.0.0',
          frontendName: 'web',
          aggregateFrontendLock: { ...baseline, models: {} },
        }),
      ),
    ).rejects.toThrow('requires selected model item');
    await expect(
      Effect.runPromise(
        validateAggregateFrontendLock({
          aggregateName: 'shopper',
          aggregateVersion: '2.0.0',
          frontendName: 'web',
          aggregateFrontendLock: baseline,
        }),
      ),
    ).rejects.toThrow('owner is unavailable');
    await expect(
      Effect.runPromise(
        validateAggregateFrontendLock({
          aggregateName: 'shopper',
          aggregateVersion: '1.0.0',
          frontendName: 'web',
          aggregateFrontendLock: {
            ...baseline,
            contracts: {
              ...baseline.contracts,
              unknown: baseline.contracts.update!,
            },
          },
        }),
      ),
    ).rejects.toThrow('unavailable');
  });
  it('accepts aggregate locks after JSON transport and preserves the selected descriptors', async () => {
    const frontend = fixtures.aggregateController;
    const lock = makeAggregateFrontendLock({ frontend });
    const transported = Schema.decodeUnknownSync(AggregateFrontendLockSchema)(
      JSON.parse(JSON.stringify(lock)),
    );
    expect(transported).toEqual(lock);
    const selected = await Effect.runPromise(
      validateAggregateFrontendLock({
        aggregateName: 'shopper',
        aggregateVersion: '1.0.0',
        frontendName: 'web',
        aggregateFrontendLock: transported,
      }).pipe(Effect.provide(AsyncLive)),
    );
    expect(selected.frontendSpec.models.item).toMatchObject({
      properties: lock.models.item?.propertiesShape,
    });
    expect(selected.frontendSpec.contracts.update).toEqual(
      expect.objectContaining(lock.contracts.update),
    );
    expect(
      Schema.decodeUnknownSync(SelectedAggregateFrontendLockSchema)(
        JSON.parse(JSON.stringify(selected)),
      ),
    ).toEqual(selected);
  });

  it('accepts service locks after JSON transport', async () => {
    const frontend = fixtures.serviceController;
    const lock = makeServiceFrontendLock({ frontend });
    const transported = Schema.decodeUnknownSync(ServiceFrontendLockSchema)(
      JSON.parse(JSON.stringify(lock)),
    );
    expect(transported).toEqual(lock);
    const selected = await Effect.runPromise(
      validateServiceFrontendLock({
        serviceName: 'catalog',
        serviceVersion: '1.0.0',
        frontendName: 'web',
        serviceFrontendLock: transported,
      }).pipe(Effect.provide(AsyncLive)),
    );
    expect(selected.frontendSpec.models.item).toMatchObject({
      properties: lock.models.item?.propertiesShape,
    });
  });

  it.each(['title', 'settings'])(
    'rejects changed aggregate model descriptor %s',
    async field => {
      const baseline = makeAggregateFrontendLock({
        frontend: fixtures.aggregateController,
      });
      const lock = Schema.decodeUnknownSync(AggregateFrontendLockSchema)({
        ...baseline,
        models: {
          ...baseline.models,
          item: {
            ...baseline.models.item,
            propertiesShape: {
              ...baseline.models.item?.propertiesShape,
              [field]:
                field === 'settings'
                  ? {
                      kind: 'json',
                      nullable: false,
                      schema: {
                        dialect: 'draft-2020-12',
                        definitions: {},
                        schema: { type: 'string' },
                      },
                    }
                  : { kind: 'text', nullable: true, unique: false },
            },
          },
        },
      });
      await expect(
        Effect.runPromise(
          validateAggregateFrontendLock({
            aggregateName: 'shopper',
            aggregateVersion: '1.0.0',
            frontendName: 'web',
            aggregateFrontendLock: lock,
          }).pipe(Effect.provide(AsyncLive)),
        ),
      ).rejects.toThrow('changed after publication');
    },
  );

  it.each(['title', 'settings'])(
    'rejects changed service model descriptor %s',
    async field => {
      const baseline = makeServiceFrontendLock({
        frontend: fixtures.serviceController,
      });
      const lock = Schema.decodeUnknownSync(ServiceFrontendLockSchema)({
        ...baseline,
        models: {
          ...baseline.models,
          item: {
            ...baseline.models.item,
            propertiesShape: {
              ...baseline.models.item?.propertiesShape,
              [field]:
                field === 'settings'
                  ? {
                      kind: 'json',
                      nullable: false,
                      schema: {
                        dialect: 'draft-2020-12',
                        definitions: {},
                        schema: { type: 'string' },
                      },
                    }
                  : { kind: 'text', nullable: true, unique: false },
            },
          },
        },
      });
      await expect(
        Effect.runPromise(
          validateServiceFrontendLock({
            serviceName: 'catalog',
            serviceVersion: '1.0.0',
            frontendName: 'web',
            serviceFrontendLock: lock,
          }).pipe(Effect.provide(AsyncLive)),
        ),
      ).rejects.toThrow('changed after publication');
    },
  );

  it.each(['title', 'settings'])(
    'rejects changed contract descriptor %s',
    async field => {
      const baseline = makeAggregateFrontendLock({
        frontend: fixtures.aggregateController,
      });
      const lock = Schema.decodeUnknownSync(AggregateFrontendLockSchema)({
        ...baseline,
        contracts: {
          ...baseline.contracts,
          update: {
            ...baseline.contracts.update,
            payloadShape: {
              ...baseline.contracts.update?.payloadShape,
              [field]:
                field === 'settings'
                  ? {
                      kind: 'json',
                      nullable: false,
                      schema: {
                        dialect: 'draft-2020-12',
                        definitions: {},
                        schema: { type: 'string' },
                      },
                    }
                  : { kind: 'text', nullable: true, unique: false },
            },
          },
        },
      });
      await expect(
        Effect.runPromise(
          validateAggregateFrontendLock({
            aggregateName: 'shopper',
            aggregateVersion: '1.0.0',
            frontendName: 'web',
            aggregateFrontendLock: lock,
          }).pipe(Effect.provide(AsyncLive)),
        ),
      ).rejects.toThrow('changed after publication');
    },
  );
});
