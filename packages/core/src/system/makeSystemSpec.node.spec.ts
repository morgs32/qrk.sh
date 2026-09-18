import { userAggregate as authenticationFixtureOwner } from '@zerospin/core/fixtures/system';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { defineAggregate } from '../aggregate/defineAggregate.ts';
import { makeAggregateVersion } from '../aggregate/makeAggregateVersion.ts';
import { defineContract } from '../contracts/defineContract.ts';
import { makeContractVersion } from '../contracts/makeContractVersion.ts';
import { defineModel } from '../models/defineModel.ts';
import { makeModelVersion } from '../models/makeModelVersion.ts';
import { makeSelection } from '../models/makeSelection.ts';
import { makeService } from '../service/makeService.ts';

import { makeSystem } from './makeSystem.ts';
import { makeSystemSpec } from './makeSystemSpec.ts';
import { SystemSpecSchema } from './SystemSpecSchema.ts';

const ItemModel = defineModel({ name: 'item', abbreviation: 'itm' });

const Item = makeModelVersion(ItemModel, {
  attributes: { quantity: primitives.integer() },
  indexes: [],
  version: '1.0.0',
});

const addItem = makeContractVersion(defineContract('addItem'), {
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

      aggregates: {
        shopper: [
          makeAggregateVersion(defineAggregate({ name: 'shopper' }), {
            ...authenticationFixtureOwner.authentication,
            version: '2.0.0',
            authorize: () => Effect.void,
            models: { item: Item },
            contracts: { addItem: { contract: addItem } },
            selections: {
              item: makeSelection({ model: Item, where: () => ({}) }),
            },
          }),
        ],
      },
      services: {
        catalog: [
          makeService({
            ...authenticationFixtureOwner.authentication,
            name: 'catalog',
            version: '1.0.0',
            authorize: () => Effect.void,
            models: {},
            contracts: {},
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
              "authentication": {
                "authenticationJsonSchema": {
                  "definitions": {},
                  "dialect": "draft-2020-12",
                  "schema": {
                    "additionalProperties": false,
                    "properties": {
                      "aggregateId": {
                        "type": "string",
                      },
                      "userId": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "aggregateId",
                      "userId",
                    ],
                    "type": "object",
                  },
                },
                "pattern": "/:userId",
                "selectionJsonSchema": {
                  "definitions": {},
                  "dialect": "draft-2020-12",
                  "schema": {
                    "additionalProperties": false,
                    "properties": {
                      "userId": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "userId",
                    ],
                    "type": "object",
                  },
                },
                "signatureJsonSchema": {
                  "definitions": {},
                  "dialect": "draft-2020-12",
                  "schema": {
                    "additionalProperties": false,
                    "properties": {
                      "userId": {},
                    },
                    "required": [
                      "userId",
                    ],
                    "type": "object",
                  },
                },
              },
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
        "services": {
          "catalog": {
            "1.0.0": {
              "authentication": {
                "authenticationJsonSchema": {
                  "definitions": {},
                  "dialect": "draft-2020-12",
                  "schema": {
                    "additionalProperties": false,
                    "properties": {
                      "aggregateId": {
                        "type": "string",
                      },
                      "userId": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "aggregateId",
                      "userId",
                    ],
                    "type": "object",
                  },
                },
                "pattern": "/:userId",
                "selectionJsonSchema": {
                  "definitions": {},
                  "dialect": "draft-2020-12",
                  "schema": {
                    "additionalProperties": false,
                    "properties": {
                      "userId": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "userId",
                    ],
                    "type": "object",
                  },
                },
                "signatureJsonSchema": {
                  "definitions": {},
                  "dialect": "draft-2020-12",
                  "schema": {
                    "additionalProperties": false,
                    "properties": {
                      "userId": {},
                    },
                    "required": [
                      "userId",
                    ],
                    "type": "object",
                  },
                },
              },
              "contracts": {},
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
  const command = makeContractVersion(defineContract('configure'), {
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

    services: {},
    aggregates: {
      shopper: [
        makeAggregateVersion(defineAggregate({ name: 'shopper' }), {
          ...authenticationFixtureOwner.authentication,
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
