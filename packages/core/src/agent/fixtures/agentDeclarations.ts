import assert from 'node:assert/strict';

import { RoutePattern } from '@remix-run/route-pattern';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { makeAggregateVersion } from '../../aggregate/make/makeAggregateVersion.ts';
import { defineAggregateActor } from '../../aggregateActor/defineAggregateActor.ts';
import { makeAggregateActorVersion } from '../../aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion.ts';
import { requireApplicationActorAuthentication } from '../../aggregateActor/requireApplicationActorAuthentication.ts';
import { makeActorIdentity } from '../../identity/make/makeActorIdentity/makeActorIdentity.ts';
import { defineModel } from '../../models/defineModel.ts';
import { makeActorDbVersion } from '../../models/make/makeActorDbVersion.ts';
import { makeModelVersion } from '../../models/make/makeModelVersion.ts';
import { makeSystem } from '../../system/make/makeSystem/makeSystem.ts';
import { makeSystemSpec } from '../../system/make/makeSystemSpec.ts';
import { SystemSpecSchema } from '../../system/SystemSpecSchema.ts';
import { AgentQuerySchema } from '../AgentQuerySchema.ts';
import { makeAgent } from '../makeAgent.ts';

const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: { amount: primitives.integer() },
    indexes: [],
  },
);
const db = makeActorDbVersion({ models: { item } });
const identity = makeActorIdentity({
  claims: Schema.Struct({
    aggregateId: Schema.String.check(Schema.isPattern(/^acct_/)),
  }),
  actorPath: RoutePattern.parse('/'),
});
const actor = makeAggregateActorVersion(
  defineAggregateActor({ name: 'preview' }),
  {
    version: '1.0.0',
    authentication: 'system',
    db,
    identity,
    contracts: {},
    selections: { item: db.query.item.findMany({}) },
  },
);
const aggregate = makeAggregateVersion(
  { name: 'fixture' },
  {
    version: '1.0.0',
    models: { item },
    contracts: {},
    actors: { preview: actor },
  },
);
const agent = makeAgent({
  aggregate,
  actor,
  query: { modelName: 'item', where: { amount: { gt: 0 } } },
});
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
  manifest.aggregates.fixture?.['1.0.0']?.actors.preview?.authentication,
  'system',
);
assert.equal(
  manifest.agents.positiveItems?.models.item?.properties.amount?.kind,
  'integer',
);
assert.throws(() =>
  makeSystem({ name: 'fixture', aggregates: {}, agents: { invalid: agent } }),
);
const unregistered = makeAggregateActorVersion(
  defineAggregateActor({ name: 'other' }),
  {
    version: '1.0.0',
    authentication: 'system',
    db,
    identity,
    contracts: {},
    selections: { item: db.query.item.findMany({}) },
  },
);
assert.throws(() =>
  makeSystem({
    name: 'fixture',
    aggregates: { fixture: { '1.0.0': aggregate } },
    agents: {
      invalid: makeAgent({
        aggregate,
        actor: unregistered,
        query: { modelName: 'item' },
      }),
    },
  }),
);
assert.throws(() =>
  makeSystem({
    name: 'fixture',
    aggregates: { fixture: { '1.0.0': aggregate } },
    agents: {
      invalid: makeAgent({
        aggregate,
        actor,
        query: { modelName: 'item', where: { unknown: { gt: 0 } } },
      }),
    },
  }),
);
assert.throws(() =>
  Schema.decodeUnknownSync(AgentQuerySchema)(
    { modelName: 'item', where: () => true },
    { onExcessProperty: 'error' },
  ),
);
assert.throws(() =>
  Schema.decodeUnknownSync(AgentQuerySchema)(
    { modelName: 'item', sql: 'SELECT *' },
    { onExcessProperty: 'error' },
  ),
);
assert.throws(
  () =>
    makeSystem({
      name: 'fixture',
      aggregates: { fixture: { '1.0.0': aggregate } },
      agents: {
        invalid: makeAgent({
          aggregate,
          actor,
          query: { modelName: 'item', where: { toString: { eq: 'wrong' } } },
        }),
      },
    }),
  /outside the model/,
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
        invalid: makeAgent({
          aggregate: applicationAggregate,
          actor: applicationActor,
          query: { modelName: 'item' },
        }),
      },
    }),
  /system-only/,
);
assert.throws(
  () =>
    makeSystem({
      name: 'fixture',
      aggregates: { fixture: { '1.0.0': aggregate } },
      agents: {
        invalid: makeAgent({
          aggregate,
          actor,
          query: { modelName: 'item', where: { amount: { gt: 'wrong' } } },
        }),
      },
    }),
  /invalid literal/,
);
const missingModel = makeAgent({
  aggregate,
  actor,
  query: {
    // @ts-expect-error The query model must belong to the actor database.
    modelName: 'missing',
  },
});
assert.throws(
  () =>
    makeSystem({
      name: 'fixture',
      aggregates: { fixture: { '1.0.0': aggregate } },
      agents: { invalid: missingModel },
    }),
  /outside the actor projection/,
);
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
  'Agent declarations, manifest round-trip, invalid bindings and system-only admission passed',
);
