import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeContract } from '../contracts/makeContract.ts';
import { userAccount } from '../fixtures/system.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';
import { makeServiceController } from '../service/makeServiceController.ts';
import { makeServiceActorController } from '../serviceActorController/makeServiceActorController.ts';
import { makeServiceFrontendController } from '../serviceFrontendController/makeServiceFrontendController.ts';

import { makeSystem } from './makeSystem.ts';
import { makeSystemSpec } from './makeSystemSpec.ts';
import { SystemSpecSchema } from './SystemSpecSchema.ts';

const Product = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'prd',
    modelName: 'product',
    attributes: {
      name: primitives.text(),
      price: primitives.number(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [
    {
      abbreviation: 'prd',
      modelName: 'product',
      attributes: {
        name: primitives.text(),
        price: primitives.number(),
      },
      indexes: [],
      version: '0.9.0',
    },
  ],
);

const createProduct = makeContract(
  {
    commandName: 'createProduct',
    payload: {
      id: Product.primaryKey({ autogenerate: false }),
      name: primitives.text(),
      price: primitives.number(),
    },
    mutations: Schema.Struct({
      created: Product.createMutation('1.0.0'),
    }),
    program: ({ payload }) =>
      Effect.all({
        created: Product.create('1.0.0', {
          resourceId: payload.id,
          attributes: {
            name: payload.name,
            price: payload.price,
          },
        }),
      }),
    version: '1.0.0',
  },
  [
    {
      commandName: 'createProduct',
      version: '0.9.0',
      payload: {
        id: Product.primaryKey({ autogenerate: false }),
        title: primitives.text(),
        price: primitives.number(),
      },
      adaptPayload: ({ payload }) =>
        Effect.succeed({
          id: payload.id,
          name: payload.title,
          price: payload.price,
        }),
    },
  ],
);

const catalog = makeServiceFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  actorName: 'shopper',
  frontendName: 'catalog',
  version: '1.0.0',
  models: { product: Product },
  signature: Schema.Struct({ subject: Schema.String }),
});

const shopper = makeServiceActorController({
  name: 'shopper',
  version: '1.0.0',
  models: { product: Product },
  frontends: {
    catalog: {
      frontendController: catalog,
      authenticate: () => Effect.succeed('actr_shopper'),
    },
  },
});

const appService = makeServiceController({
  name: 'app',
  version: '1.0.0',
  models: { product: Product },
  contracts: { createProduct },
  actorControllers: { shopper },
});

describe('makeSystemSpec', () => {
  it('repeats complete serializable controller, model, contract, actor, and frontend definitions', () => {
    const system = makeSystem({
      name: 'shopping',
      version: '1.0.1',
      accountControllers: { user: userAccount },
      serviceControllers: { app: appService },
    });

    const spec = makeSystemSpec({ system });

    expect(spec).toMatchObject({
      systemName: 'shopping',
      version: '1.0.1',
    });
    expect(
      spec.serviceControllers.app?.models.product?.properties.name,
    ).toMatchObject({
      kind: 'text',
      nullable: false,
      unique: false,
    });
    expect(
      spec.serviceControllers.app?.models.product?.properties.price,
    ).toMatchObject({
      kind: 'number',
      nullable: false,
      unique: false,
    });
    expect(
      spec.serviceControllers.app?.models.product?.properties.deletedAt,
    ).toMatchObject({ kind: 'date', nullable: true });
    expect(
      spec.serviceControllers.app?.models.product?.historicalDefinitions[0]
        ?.properties.deletedAt,
    ).toMatchObject({ kind: 'date', nullable: true });
    expect(
      spec.accountControllers.user?.actorControllers.main?.selections.user,
    ).toEqual({ modelName: 'user' });
    expect(
      spec.accountControllers.user?.actorControllers.main?.frontends.main
        ?.frontendController.contracts.createList?.payloadJsonSchema,
    ).toMatchObject({ type: 'object' });
    expect(
      spec.serviceControllers.app?.contracts.createProduct
        ?.historicalDefinitions,
    ).toMatchObject([
      {
        commandName: 'createProduct',
        version: '0.9.0',
        payloadJsonSchema: { type: 'object' },
      },
    ]);
    expect(
      spec.serviceControllers.app?.actorControllers.shopper?.frontends.catalog,
    ).toMatchObject({
      name: 'catalog',
      frontendController: {
        serviceName: 'app',
        actorName: 'shopper',
        frontendName: 'catalog',
        version: '1.0.0',
        models: {
          product: {
            modelName: 'product',
            abbreviation: 'prd',
            version: '1.0.0',
          },
        },
        signatureJsonSchema: { type: 'object' },
      },
    });
    expect(
      spec.serviceControllers.app?.actorControllers.shopper?.frontends.catalog
        ?.frontendController,
    ).not.toHaveProperty('systemName');
    expect(
      spec.accountControllers.user?.actorControllers.main?.frontends.main
        ?.frontendController.signatureJsonSchema,
    ).toMatchObject({ type: 'object' });

    expect(Schema.decodeUnknownSync(SystemSpecSchema)(spec)).toEqual(spec);
  });
});
