import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { aggregates } from '../aggregate/index.ts';
import { authentication } from '../authentication/index.ts';
import { contracts } from '../contracts/index.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { models } from '../models/index.ts';
import { makeSelection } from '../models/makeSelection.ts';
import { makeService } from '../service/makeService.ts';

import { makeSystem } from './makeSystem.ts';
import { makeSystemSpec } from './makeSystemSpec.ts';
import { SystemSpecSchema } from './SystemSpecSchema.ts';

const ItemModel = models.makeModel({ name: 'item', abbreviation: 'itm' });

const Item = models.makeVersion(ItemModel, {
  attributes: { quantity: primitives.integer() },
  indexes: [],
  version: '1.0.0',
});

const addItem = contracts.makeVersion(contracts.makeCommand('addItem'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: ItemModel.abbreviation }),
    quantity: primitives.integer(),
  },
  models: { item: Item },
  program: ({ models, payload }) =>
    Effect.all({
      created: models.item.create({
        resourceId: payload.id,
        attributes: { quantity: payload.quantity },
      }),
    }),
  version: '1.0.0',
});

describe('makeSystemSpec', () => {
  it('serializes the system spec', () => {
    const system = makeSystem({
      name: 'shopping',
      authentication: [
        authentication.makeVersion({
          version: '1.0.0',
          signature: Schema.Struct({ userId: Schema.NonEmptyString }),
          authenticate: ({ signature }) => Effect.succeed(signature.userId),
        }),
      ],
      aggregates: {
        shopper: [
          aggregates.makeVersion(
            aggregates.makeAggregate({ name: 'shopper' }),
            {
              version: '2.0.0',
              authorize: () => Effect.void,
              models: { item: Item },
              contracts: { addItem: { contract: addItem } },
              selections: {
                item: makeSelection({ model: Item, where: () => ({}) }),
              },
            },
          ),
        ],
      },
      services: {
        catalog: [
          makeService({
            name: 'catalog',
            version: '1.0.0',
            historicalDefinitions: [],
            authorize: () => Effect.void,
            models: {},
            contracts: {},
            frontends: {
              browse: {
                controller: makeFrontendController({
                  systemName: 'shopping',
                  serviceVersion: '1.0.0',
                  serviceName: 'catalog',
                  name: 'browse',
                  models: {},
                }),
              },
            },
          }),
        ],
      },
    });

    const spec = makeSystemSpec({ system });
    expect(system).not.toHaveProperty('version');
    expect(spec).not.toHaveProperty('version');
    expect(JSON.stringify(spec)).not.toContain('"program"');
    expect(spec).toMatchInlineSnapshot(`
      {
        "aggregates": {
          "shopper": {
            "2.0.0": {
              "contracts": {
                "addItem": {
                  "commandName": "addItem",
                  "models": {
                    "item": {
                      "abbreviation": "itm",
                      "attributes": [
                        "quantity",
                      ],
                      "attributesShape": {
                        "quantity": {
                          "kind": "integer",
                          "nullable": false,
                          "unique": false,
                        },
                      },
                      "indexes": [],
                      "modelName": "item",
                      "propertiesShape": {
                        "createdAt": {
                          "kind": "date",
                          "nullable": false,
                          "unique": false,
                        },
                        "id": {
                          "abbreviation": "itm",
                          "kind": "primaryKey",
                          "nullable": false,
                          "unique": true,
                        },
                        "modelName": {
                          "kind": "text",
                          "nullable": false,
                          "unique": false,
                        },
                        "quantity": {
                          "kind": "integer",
                          "nullable": false,
                          "unique": false,
                        },
                        "updatedAt": {
                          "kind": "date",
                          "nullable": false,
                          "unique": false,
                        },
                        "version": {
                          "kind": "text",
                          "nullable": false,
                          "unique": false,
                        },
                      },
                      "version": "1.0.0",
                    },
                  },
                  "payloadShape": {
                    "id": {
                      "abbreviation": "itm",
                      "kind": "foreignKey",
                      "nullable": false,
                      "unique": false,
                    },
                    "quantity": {
                      "kind": "integer",
                      "nullable": false,
                      "unique": false,
                    },
                  },
                  "version": "1.0.0",
                },
              },
              "models": {
                "item": {
                  "abbreviation": "itm",
                  "indexes": [],
                  "modelName": "item",
                  "properties": {
                    "createdAt": {
                      "kind": "date",
                      "nullable": false,
                      "unique": false,
                    },
                    "id": {
                      "abbreviation": "itm",
                      "kind": "primaryKey",
                      "nullable": false,
                      "unique": true,
                    },
                    "modelName": {
                      "kind": "text",
                      "nullable": false,
                      "unique": false,
                    },
                    "quantity": {
                      "kind": "integer",
                      "nullable": false,
                      "unique": false,
                    },
                    "updatedAt": {
                      "kind": "date",
                      "nullable": false,
                      "unique": false,
                    },
                    "version": {
                      "kind": "text",
                      "nullable": false,
                      "unique": false,
                    },
                  },
                  "version": "1.0.0",
                },
              },
              "name": "shopper",
              "selections": {
                "item": {
                  "modelName": "item",
                },
              },
              "services": {},
              "version": "2.0.0",
            },
          },
        },
        "authentication": [
          {
            "signatureJsonSchema": {
              "definitions": {},
              "dialect": "draft-2020-12",
              "schema": {
                "additionalProperties": false,
                "properties": {
                  "userId": {
                    "minLength": 1,
                    "type": "string",
                  },
                },
                "required": [
                  "userId",
                ],
                "type": "object",
              },
            },
            "version": "1.0.0",
          },
        ],
        "services": {
          "catalog": {
            "1.0.0": {
              "contracts": {},
              "frontends": {
                "browse": {
                  "contracts": {},
                  "controller": {
                    "contracts": {},
                    "kind": "service",
                    "modelNames": [],
                    "models": {},
                    "name": "browse",
                    "serviceFrontendLock": {
                      "frontendName": "browse",
                      "models": {},
                      "systemName": "shopping",
                    },
                    "serviceName": "catalog",
                    "serviceVersion": "1.0.0",
                    "systemName": "shopping",
                  },
                  "models": {},
                  "name": "browse",
                },
              },
              "historicalDefinitions": [],
              "models": {},
              "name": "catalog",
              "queries": {},
              "version": "1.0.0",
            },
          },
        },
        "systemName": "shopping",
      }
    `);
  });
});

it('decodes primitive payload specs without stripping nested JSON Schema', () => {
  const command = contracts.makeVersion(contracts.makeCommand('configure'), {
    version: '1.0.0',
    models: { item: Item },
    payload: {
      title: primitives.text(),
      settings: primitives.json({
        schema: Schema.Struct({ compact: Schema.Boolean }),
      }),
    },
  });
  const system = makeSystem({
    name: 'primitive-spec',
    authentication: [],
    services: {},
    aggregates: {
      shopper: [
        aggregates.makeVersion(aggregates.makeAggregate({ name: 'shopper' }), {
          version: '1.0.0',
          authorize: () => Effect.void,
          models: {},
          contracts: { configure: { contract: command } },
          selections: {},
        }),
      ],
    },
  });
  const spec = makeSystemSpec({ system });
  const decoded = Schema.decodeUnknownSync(SystemSpecSchema)(
    JSON.parse(JSON.stringify(spec)),
  );
  expect(
    decoded.aggregates.shopper?.['1.0.0']?.contracts.configure?.models,
  ).toEqual({ item: Item.spec });
  expect(
    decoded.aggregates.shopper?.['1.0.0']?.contracts.configure?.payloadShape,
  ).toEqual(command.spec.payloadShape);
  expect(
    spec.aggregates.shopper?.['1.0.0']?.contracts.configure?.payloadShape,
  ).toEqual(command.spec.payloadShape);
});
