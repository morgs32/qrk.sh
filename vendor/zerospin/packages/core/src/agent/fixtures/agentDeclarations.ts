import assert from 'node:assert/strict';

import { RoutePattern } from '@remix-run/route-pattern';
import { primitives } from '@zerospin/shapes';
import { Effect, Schema } from 'effect';

import { makeAggregateVersion } from '../../aggregate/make/makeAggregateVersion.ts';
import { defineAggregateActor } from '../../aggregateActor/defineAggregateActor.ts';
import { makeAggregateActorVersion } from '../../aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion.ts';
import { requireApplicationActorAuthentication } from '../../aggregateActor/requireApplicationActorAuthentication.ts';
import { makeAggregateSession } from '../../aggregateSession/make/makeAggregateSession.ts';
import { defineContract } from '../../contracts/defineContract.ts';
import { makeContractVersion } from '../../contracts/make/makeContractVersion.ts';
import { mapContractVersion } from '../../contracts/make/mapContractVersion.ts';
import { validatePayload } from '../../contracts/validatePayload.ts';
import { makeActorIdentity } from '../../identity/make/makeActorIdentity/makeActorIdentity.ts';
import { defineModel } from '../../models/defineModel.ts';
import { makeActorDbVersion } from '../../models/make/makeActorDbVersion.ts';
import { makeModelVersion } from '../../models/make/makeModelVersion.ts';
import { makeSystem } from '../../system/make/makeSystem/makeSystem.ts';
import { makeSystemSpec } from '../../system/make/makeSystemSpec.ts';
import { SystemSpecSchema } from '../../system/SystemSpecSchema.ts';
import {
  assertAgentContract,
  makeAgentContract,
} from '../makeAgentContract.ts';
import {
  makeAgentSessionDefinition,
  type IAgentSessionDefinitionProps,
} from '../makeAgentSessionDefinition.ts';

const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: {
      amount: primitives.integer(),
      nullableAmount: primitives.integer({ nullable: true }),
      otherId: primitives.foreignKey({ abbreviation: 'other' }),
      occurredAt: primitives.date(),
      details: primitives.json({
        schema: Schema.Struct({ label: Schema.String }),
      }),
    },
    indexes: [],
  },
);
const change = makeContractVersion(defineContract('change'), {
  version: '1.0.0',
  payload: {
    amount: primitives.integer(),
    itemId: primitives.foreignKey({ abbreviation: 'itm' }),
    occurredAt: primitives.date(),
    details: primitives.json({
      schema: Schema.Struct({ label: Schema.String }),
    }),
  },
  models: { item },
  program: ({ models, payload }) =>
    models.item.update({
      resourceId: payload.itemId,
      attributes: { amount: payload.amount },
    }),
});
const mappedChange = mapContractVersion({
  contractVersion: change,
  operations: { models: { item }, contracts: {} },
  result: Schema.Void,
  program: () => Effect.void,
});
const db = makeActorDbVersion({ models: { item } });
const identity = makeActorIdentity({
  claims: Schema.Struct({
    aggregateId: Schema.String.check(Schema.isPattern(/^acct_/)),
  }),
  actorPath: RoutePattern.parse('/'),
});
const actor = makeAggregateActorVersion(
  defineAggregateActor({ name: 'admin' }),
  {
    version: '1.0.0',
    authentication: 'system',
    db,
    identity,
    contracts: { change: mappedChange },
    selections: { item: db.query.item.findMany({}) },
  },
);
const aggregate = makeAggregateVersion(
  { name: 'fixture' },
  {
    version: '1.0.0',
    models: { item },
    contracts: { change: mappedChange },
    actors: { admin: actor },
  },
);
const binding = makeAgentContract({
  contractVersion: change,
  model: item,
  bind: { itemId: 'id', occurredAt: 'occurredAt', details: 'details' },
});
const decodedRow = Schema.decodeUnknownSync(item.table.codec)({
  id: 'itm_one',
  modelName: 'item',
  version: '1.0.0',
  createdAt: new Date('2026-10-03T00:00:00.000Z'),
  updatedAt: new Date('2026-10-03T00:00:00.000Z'),
  amount: 1,
  nullableAmount: null,
  otherId: 'other_one',
  occurredAt: new Date('2026-10-03T04:00:00.000Z'),
  details: '{"label":"decoded row"}',
});
const rowPayload = Effect.runSync(
  validatePayload(change, {
    version: '1.0.0',
    payload: {
      amount: 2,
      itemId: decodedRow.id,
      occurredAt: decodedRow.occurredAt,
      details: decodedRow.details,
    },
  }),
);
assert.ok(rowPayload.occurredAt instanceof Date);
assert.deepEqual(rowPayload.details, { label: 'decoded row' });

function session(props: Partial<IAgentSessionDefinitionProps> = {}) {
  return makeAggregateSession({
    definition: makeAgentSessionDefinition({
      systemName: 'fixture',
      sessionName: 'positiveItems',
      aggregateName: aggregate.name,
      aggregateVersion: aggregate.version,
      actorName: actor.name,
      actorVersion: actor.version,
      claimsSchema: identity.claimsSchema,
      db,
      contracts: { change: binding },
      selections: {
        item: db.query.item.findMany({ where: { amount: { gt: 0 } } }),
      },
      ...props,
    }),
  });
}
const agent = session();
const system = makeSystem({
  name: 'fixture',
  aggregates: { fixture: { '1.0.0': aggregate } },
  agents: { positiveItems: agent },
});
const manifest = makeSystemSpec({ system });
assert.deepEqual(
  Schema.decodeUnknownSync(Schema.fromJsonString(SystemSpecSchema))(
    JSON.stringify(manifest),
  ),
  manifest,
);
assert.equal(
  manifest.aggregates.fixture?.['1.0.0']?.actors.admin?.authentication,
  'system',
);
assert.equal(
  manifest.agents.positiveItems?.models.item?.properties.amount?.kind,
  'integer',
);
assert.equal(manifest.agents.positiveItems?.selections.item?.modelName, 'item');
assert.equal(
  manifest.agents.positiveItems?.selections.item?.query.bindings[0]?.type,
  'literal',
);
assert.deepEqual(manifest.agents.positiveItems?.contractBindings.change, {
  modelName: 'item',
  bind: { itemId: 'id', occurredAt: 'occurredAt', details: 'details' },
});
assert.equal(manifest.agents.positiveItems?.contracts.change?.version, '1.0.0');
assert.equal(system.agents.positiveItems, agent.definition);
assert.equal(agent.definition.contracts.change, change);
assert.equal(agent.definition.contractBindings.change?.model, item);
assert.equal(agent.definition.db, db);
assert.ok(Object.isFrozen(binding) && Object.isFrozen(binding.bind));
assert.ok(Object.isFrozen(agent.definition.contractBindings));
assert.ok(Object.isFrozen(agent.definition.contractBindings.change?.bind));
assert.equal(Object.hasOwn(change, 'bind'), false);
assert.equal(Object.hasOwn(change, 'contractVersion'), false);
assert.throws(() =>
  makeSystem({ name: 'fixture', aggregates: {}, agents: { invalid: agent } }),
);
assert.throws(() =>
  makeSystem({
    name: 'fixture',
    aggregates: { fixture: { '1.0.0': aggregate } },
    agents: { invalid: session({ actorName: 'other' }) },
  }),
);
assert.throws(
  () =>
    assertAgentContract({
      contractVersion: change,
      model: item,
      bind: { missing: 'id' },
    }),
  /payload field missing is outside the contract/,
);
assert.throws(
  () =>
    assertAgentContract({
      contractVersion: change,
      model: item,
      bind: { itemId: 'missing' },
    }),
  /model field missing is outside the model/,
);
assert.throws(
  () =>
    makeAgentContract({
      contractVersion: change,
      model: { ...item },
      bind: {},
    }),
  /Model/,
);
assert.throws(
  () =>
    makeAgentContract({
      contractVersion: { ...change },
      model: item,
      bind: {},
    }),
  /Contract/,
);
assert.throws(
  () =>
    session({
      contracts: { change: { ...binding, contractVersion: mappedChange } },
    }),
  /ordinary browser contracts/,
);
assert.throws(
  () => session({ selections: {} }),
  /exact selected database model/,
);
assert.throws(
  () => session({ selections: { missing: db.query.item.findMany({}) } }),
  /Invalid actor selection/,
);
const otherDb = makeActorDbVersion({ models: { item } });
assert.throws(
  () => session({ selections: { item: otherDb.query.item.findMany({}) } }),
  /must query its actor database model/,
);
assert.throws(
  () =>
    session({
      selections: {
        item: db.query.item.findMany({ columns: { amount: true } }),
      },
    }),
  /complete model rows/,
);
const foreignItem = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: item.attributes,
    indexes: [],
  },
);
assert.throws(
  () => session({ contracts: { change: { ...binding, model: foreignItem } } }),
  /exact selected database model/,
);
const foreignChange = makeContractVersion(defineContract('change'), {
  version: '1.0.0',
  payload: change.payload,
  models: { item },
  program: () => Effect.void,
});
assert.throws(
  () =>
    makeSystem({
      name: 'fixture',
      aggregates: { fixture: { '1.0.0': aggregate } },
      agents: {
        invalid: session({
          contracts: { change: { ...binding, contractVersion: foreignChange } },
        }),
      },
    }),
  /exact ordinary contract/,
);
function composeDefinition(definition: typeof agent.definition) {
  return makeSystem({
    name: 'fixture',
    aggregates: { fixture: { '1.0.0': aggregate } },
    agents: { invalid: { definition } },
  });
}
assert.throws(
  () =>
    composeDefinition({
      ...agent.definition,
      contractBindings: { change: { model: item, bind: { missing: 'id' } } },
    }),
  /payload field missing is outside the contract/,
);
assert.throws(
  () =>
    composeDefinition({
      ...agent.definition,
      contractBindings: {
        change: { model: item, bind: { itemId: 'missing' } },
      },
    }),
  /model field missing is outside the model/,
);
assert.throws(
  () =>
    composeDefinition({
      ...agent.definition,
      contractBindings: {
        change: { model: foreignItem, bind: { itemId: 'id' } },
      },
    }),
  /exact selected model/,
);
assert.throws(
  () => composeDefinition({ ...agent.definition, contractBindings: {} }),
  /normalized metadata/,
);
assert.throws(
  () => composeDefinition({ ...agent.definition, capturedSelections: {} }),
  /normalized metadata/,
);

const selectedItem = agent.definition.capturedSelections.item;
assert.ok(selectedItem);
assert.throws(
  () =>
    composeDefinition({
      ...agent.definition,
      capturedSelections: {
        item: { ...selectedItem, models: { ...db.models } },
      },
    }),
  /canonical model selection/,
);
assert.throws(
  () =>
    composeDefinition({
      ...agent.definition,
      capturedSelections: {
        item: { ...selectedItem, all: () => [] },
      },
    }),
  /canonical model selection/,
);

const unrelatedPayloadContract = makeContractVersion(defineContract('change'), {
  version: '1.0.0',
  payload: { foreignAmount: primitives.integer() },
  models: { item },
  program: () => Effect.void,
});
const forgedContractBinding = {
  model: item,
  bind: { foreignAmount: 'amount' },
  contractVersion: unrelatedPayloadContract,
};
assert.throws(
  () =>
    composeDefinition({
      ...agent.definition,
      contractBindings: { change: forgedContractBinding },
    }),
  /payload field foreignAmount is outside the contract/,
);

const applicationActor = makeAggregateActorVersion(
  defineAggregateActor({ name: 'application' }),
  {
    version: '1.0.0',
    authentication: 'none',
    db,
    identity,
    contracts: {},
    selections: { item: db.query.item.findMany({}) },
  },
);
const applicationAggregate = makeAggregateVersion(
  { name: 'application' },
  {
    version: '1.0.0',
    models: { item },
    contracts: {},
    actors: { application: applicationActor },
  },
);
assert.throws(
  () =>
    makeSystem({
      name: 'fixture',
      aggregates: { application: { '1.0.0': applicationAggregate } },
      agents: {
        invalid: session({
          aggregateName: 'application',
          actorName: 'application',
        }),
      },
    }),
  /system-only/,
);
const filteredActor = makeAggregateActorVersion(
  defineAggregateActor({ name: 'filtered' }),
  {
    version: '1.0.0',
    authentication: 'system',
    db,
    identity,
    contracts: { change: mappedChange },
    selections: {
      item: db.query.item.findMany({ where: { amount: { gt: 0 } } }),
    },
  },
);
const filteredAggregate = makeAggregateVersion(
  { name: 'filtered' },
  {
    version: '1.0.0',
    models: { item },
    contracts: { change: mappedChange },
    actors: { filtered: filteredActor },
  },
);
assert.throws(
  () =>
    makeSystem({
      name: 'fixture',
      aggregates: { filtered: { '1.0.0': filteredAggregate } },
      agents: {
        invalid: session({ aggregateName: 'filtered', actorName: 'filtered' }),
      },
    }),
  /full-row actor selection/,
);

/** Compile-only assertions exercise the authored decoded-value binding boundary. */
function bindingTypeChecks() {
  makeAgentContract({
    contractVersion: change,
    model: item,
    bind: { amount: 'amount' },
  });
  makeAgentContract({
    contractVersion: change,
    model: item,
    bind: { occurredAt: 'createdAt', details: 'details' },
  });
  makeAgentContract({
    contractVersion: change,
    model: item,
    bind: {
      // @ts-expect-error Payload fields must exist on the contract.
      missing: 'id',
    },
  });
  makeAgentContract({
    contractVersion: change,
    model: item,
    bind: {
      // @ts-expect-error Model fields must exist on the row.
      amount: 'missing',
    },
  });
  makeAgentContract({
    contractVersion: change,
    model: item,
    bind: {
      // @ts-expect-error Nullable row values cannot bind required payload values.
      amount: 'nullableAmount',
    },
  });
  makeAgentContract({
    contractVersion: change,
    model: item,
    bind: {
      // @ts-expect-error Numeric row fields do not decode to dates.
      occurredAt: 'amount',
    },
  });
  makeAgentContract({
    contractVersion: change,
    model: item,
    bind: {
      // @ts-expect-error Plain text row fields do not satisfy prefixed IDs.
      itemId: 'modelName',
    },
  });
  makeAgentContract({
    contractVersion: change,
    model: item,
    bind: {
      // @ts-expect-error Different ID abbreviations cannot bind one another.
      itemId: 'otherId',
    },
  });
  makeAgentContract({
    contractVersion: change,
    model: item,
    bind: {
      // @ts-expect-error Dates cannot bind JSON object payloads.
      details: 'occurredAt',
    },
  });
}
void bindingTypeChecks;
await assert.rejects(
  Effect.runPromise(requireApplicationActorAuthentication('system')),
  /System-only actors/,
);
assert.equal(
  await Effect.runPromise(requireApplicationActorAuthentication('none')),
  'none',
);
await system.runtime.dispose();
console.log(
  'Agent selections, manifest, canonical normalization and decoded row bindings passed',
);
