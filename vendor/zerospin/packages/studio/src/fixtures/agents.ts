import { makeAgentSession } from '@zerospin/browser/makeAgentSession';
import { makeAgentContract } from '@zerospin/core/agent/makeAgentContract';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import type { IAgentSpec } from '@zerospin/core/system/types';
import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import { Effect, Schema } from 'effect';

const flag = makeModelVersion(
  defineModel({ name: 'flag', abbreviation: 'flg' }),
  {
    version: '1.0.0',
    attributes: { visible: primitives.boolean() },
    indexes: [],
  },
);
const metadataSchema = Schema.Struct({ marker: Schema.String });
const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: {
      amount: primitives.integer(),
      labelStatus: primitives.text(),
      trackingStatus: primitives.text(),
      flagId: primitives.ref({
        table: flag.table,
        relation: 'flag',
        inverse: 'items',
      }),
      capturedAt: primitives.date(),
      metadata: primitives.json({ schema: metadataSchema }),
      note: primitives.text(),
    },
    indexes: [],
  },
);
const claims = Schema.Struct({ aggregateId: Schema.String });
const createTrackingLabel = makeContractVersion(
  defineContract('createTrackingLabel'),
  {
    version: '1.0.0',
    claims,
    models: { item, flag },
    payload: { itemId: primitives.foreignKey({ abbreviation: 'itm' }) },
    failures: {
      ineligible: ContractError.schema({ code: 'fixture-ineligible' }),
    },
    guard: ({ db, payload, failures }) =>
      db.query.item.findFirst({ where: { id: { eq: payload.itemId } } }).sync()
        ?.amount === 13
        ? Effect.fail(
            failures.ineligible.make({ message: 'Fixture row is ineligible.' }),
          )
        : Effect.void,
    program: ({ models, payload }) =>
      models.item.update({
        resourceId: payload.itemId,
        attributes: { labelStatus: 'pending' },
      }),
  },
);
const updateTrackingInfo = makeContractVersion(
  defineContract('updateTrackingInfo'),
  {
    version: '1.0.0',
    claims,
    models: { item, flag },
    payload: { itemId: primitives.foreignKey({ abbreviation: 'itm' }) },
    program: ({ models, payload }) =>
      models.item.update({
        resourceId: payload.itemId,
        attributes: { trackingStatus: 'pending' },
      }),
  },
);
const editItem = makeContractVersion(defineContract('editItem'), {
  version: '1.0.0',
  claims,
  models: { item, flag },
  payload: {
    itemId: primitives.foreignKey({ abbreviation: 'itm' }),
    capturedAt: primitives.date(),
    metadata: primitives.json({ schema: metadataSchema }),
    note: primitives.text(),
  },
  failures: {
    ineligible: ContractError.schema({ code: 'fixture-edit-ineligible' }),
  },
  guard: ({ payload, failures }) =>
    payload.note === 'forbidden'
      ? Effect.fail(
          failures.ineligible.make({ message: 'Fixture note is ineligible.' }),
        )
      : Effect.void,
  program: ({ models, payload }) =>
    models.item.update({
      resourceId: payload.itemId,
      attributes: { note: payload.note },
    }),
});
const db = makeActorDbVersion({ models: { item, flag } });
export const positiveItems = makeAgentSession({
  systemName: 'fixture',
  sessionName: 'positiveItems',
  aggregateName: 'fixture',
  aggregateVersion: '1.0.0',
  actorName: 'admin',
  actorVersion: '1.0.0',
  claimsSchema: claims,
  db,
  selections: {
    item: db.query.item.findMany({
      where: { amount: { gt: 0 }, flag: { visible: { eq: true } } },
    }),
    flag: db.query.flag.findMany({}),
  },
  contracts: {
    createTrackingLabel: makeAgentContract({
      contractVersion: createTrackingLabel,
      model: item,
      bind: { itemId: 'id' },
    }),
    updateTrackingInfo: makeAgentContract({
      contractVersion: updateTrackingInfo,
      model: item,
      bind: { itemId: 'id' },
    }),
    editItem: makeAgentContract({
      contractVersion: editItem,
      model: item,
      bind: { itemId: 'id', capturedAt: 'capturedAt', metadata: 'metadata' },
    }),
  },
});
export const agents = { positiveItems };
export const fixtureAgentSpec: IAgentSpec = {
  name: 'positiveItems',
  aggregateName: 'fixture',
  aggregateVersion: '1.0.0',
  actorName: 'admin',
  actorVersion: '1.0.0',
  sessionName: 'positiveItems',
  claimsJsonSchema: Schema.toJsonSchemaDocument(claims),
  selections: Object.fromEntries(
    Object.entries(positiveItems.definition.capturedSelections).map(
      ([name, selection]) => [
        name,
        { modelName: selection.model.modelName, query: selection.query },
      ],
    ),
  ),
  contractBindings: Object.fromEntries(
    Object.entries(positiveItems.definition.contractBindings).map(
      ([name, binding]) => [
        name,
        { modelName: binding.model.modelName, bind: binding.bind },
      ],
    ),
  ),
  contracts: Object.fromEntries(
    Object.entries(positiveItems.definition.contracts).map(
      ([name, contract]) => [
        name,
        {
          ...contract.spec,
          failureSchemas: {
            [contract.version]: contract.spec.failureJsonSchema,
          },
        },
      ],
    ),
  ),
  models: Object.fromEntries(
    Object.entries(db.models).map(([name, model]) => [
      name,
      {
        modelName: model.modelName,
        version: model.version,
        abbreviation: model.abbreviation,
        indexes: [],
        properties: model.spec.propertiesShape,
      },
    ]),
  ),
};
