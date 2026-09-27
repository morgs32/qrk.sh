import { RoutePattern } from '@remix-run/route-pattern';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import { makeAutomation } from '../automation/makeAutomation.ts';
import { defineContract } from '../contracts/defineContract.ts';
import { makeContractVersion } from '../contracts/make/makeContractVersion.ts';
import { makeActorIdentity } from '../identity/make/makeActorIdentity/makeActorIdentity.ts';
import { defineModel } from '../models/defineModel.ts';
import { makeActorDbVersion } from '../models/make/makeActorDbVersion.ts';
import { makeModelVersion } from '../models/make/makeModelVersion.ts';

import { makeAggregateActorVersion } from './make/makeAggregateActorVersion/makeAggregateActorVersion.ts';
import { updateAggregateActorVersion } from './updateAggregateActorVersion.ts';

const item = defineModel({ name: 'item', abbreviation: 'itm' });
const itemV1 = makeModelVersion(item, {
  version: '1.0.0',
  attributes: { title: primitives.text() },
  indexes: [],
});
const itemV2 = makeModelVersion(item, {
  version: '2.0.0',
  attributes: { title: primitives.text() },
  indexes: [],
});
const dbV1 = makeActorDbVersion({ models: { item: itemV1 } });
const dbV2 = makeActorDbVersion({ models: { item: itemV2 } });
const queryV1 = dbV1.query.item.findMany();
const queryV2 = dbV2.query.item.findMany();
const claims = Schema.Struct({ aggregateId: Schema.String });
const identity = makeActorIdentity({
  schema: claims,
  actorPath: RoutePattern.parse('/:aggregateId'),
});
const replacementIdentity = makeActorIdentity({
  schema: claims,
  actorPath: RoutePattern.parse('/:aggregateId'),
});
const pingV1 = makeContractVersion(defineContract('ping'), {
  version: '1.0.0',
  payload: {},
  models: {},
});
const pingV2 = makeContractVersion(defineContract('ping'), {
  version: '2.0.0',
  payload: {},
  models: {},
});
const pong = makeContractVersion(defineContract('pong'), {
  version: '1.0.0',
  payload: {},
  models: {},
});
const needsSecret = makeContractVersion(defineContract('needsSecret'), {
  version: '1.0.0',
  payload: {},
  models: {},
  identity: Schema.Struct({
    aggregateId: Schema.String,
    secret: Schema.String,
  }),
});
const oldItemContract = makeContractVersion(defineContract('oldItem'), {
  version: '1.0.0',
  payload: {},
  models: { item: itemV1 },
});
const incompatibleAutomation = makeAutomation({
  name: 'oldItemAutomation',
  on: oldItemContract,
  contracts: {},
  program: () => Effect.succeed(null),
});
const firstAutomation = makeAutomation({
  name: 'first',
  on: pingV1,
  contracts: {},
  program: () =>
    Effect.gen(function* () {
      yield* Effect.context<{ firstAutomationService: string }>();
      return null;
    }),
});
const secondAutomation = makeAutomation({
  name: 'second',
  on: pingV2,
  contracts: {},
  program: () =>
    Effect.gen(function* () {
      yield* Effect.context<{ secondAutomationService: string }>();
      return null;
    }),
});
const replacementFirstAutomation = makeAutomation({
  name: 'first',
  on: pingV2,
  contracts: {},
  program: () => Effect.succeed(null),
});
const replacementPingGuard = () => Effect.void;
const actorV1 = makeAggregateActorVersion(
  { name: 'human' },
  {
    authentication: 'none',
    version: '1.0.0',
    db: dbV1,
    identity,
    queries: { item: queryV1 },
    contracts: { ping: pingV1, pong },
    automations: { first: firstAutomation },
    guards: {
      ping: () =>
        Effect.gen(function* () {
          yield* Effect.context<{ firstGuardService: string }>();
        }),
    },
    authorize: () =>
      Effect.gen(function* () {
        yield* Effect.context<{ firstAuthorizeService: string }>();
      }),
  },
);
const actorV2 = updateAggregateActorVersion(actorV1, {
  authentication: 'none',
  version: '2.0.0',
  db: dbV2,
  identity: replacementIdentity,
  queries: { item: queryV2 },
  contracts: { ping: pingV2 },
  automations: { second: secondAutomation },
  guards: {
    pong: ({ identity: auth, payload }) => {
      const aggregateId: string = auth.aggregateId;
      void aggregateId;
      void payload;
      return Effect.gen(function* () {
        yield* Effect.context<{ secondGuardService: string }>();
      });
    },
  },
  authorize: ({ identity: auth }) => {
    const aggregateId: string = auth.aggregateId;
    void aggregateId;
    return Effect.gen(function* () {
      yield* Effect.context<{ secondAuthorizeService: string }>();
    });
  },
});
const actorV3 = updateAggregateActorVersion(actorV2, {
  version: '3.0.0',
  automations: { first: replacementFirstAutomation },
  guards: { ping: replacementPingGuard },
});

assert<Equals<typeof actorV2.name, 'human'>>();
assert<Equals<typeof actorV2.version, '2.0.0'>>();
assert<Equals<typeof actorV2.db, typeof dbV2>>();
assert<Equals<typeof actorV2.identity, typeof replacementIdentity>>();
assert<Equals<typeof actorV2.contracts.ping, typeof pingV2>>();
assert<Equals<typeof actorV2.contracts.pong, typeof pong>>();
assert<Equals<typeof actorV2.automations.first, typeof firstAutomation>>();
assert<Equals<typeof actorV2.automations.second, typeof secondAutomation>>();
assert<Equals<keyof typeof actorV2.queries, 'item'>>();
assert<Equals<typeof actorV2.queries.item, typeof queryV2>>();
type ContractRequirements = NonNullable<typeof actorV2.__contractRequirements>;
assert<
  Equals<
    Extract<ContractRequirements, { firstAutomationService: string }>,
    { firstAutomationService: string }
  >
>();
assert<
  Equals<
    Extract<ContractRequirements, { secondAutomationService: string }>,
    { secondAutomationService: string }
  >
>();
assert<
  Equals<
    Extract<ContractRequirements, { firstGuardService: string }>,
    { firstGuardService: string }
  >
>();
assert<
  Equals<
    Extract<ContractRequirements, { secondGuardService: string }>,
    { secondGuardService: string }
  >
>();
assert<
  Equals<
    NonNullable<typeof actorV2.__authorizeRequirements>,
    { secondAuthorizeService: string }
  >
>();
assert<
  Equals<typeof actorV3.automations.first, typeof replacementFirstAutomation>
>();
assert<Equals<typeof actorV3.identity, typeof replacementIdentity>>();
assert<Equals<typeof actorV3.guards.ping, typeof replacementPingGuard>>();
assert<Equals<typeof actorV3.contracts.ping, typeof pingV2>>();
assert<Equals<typeof actorV3.queries.item, typeof queryV2>>();
assert<
  Equals<
    NonNullable<typeof actorV3.__authorizeRequirements>,
    { secondAuthorizeService: string }
  >
>();
type ThirdRequirements = NonNullable<typeof actorV3.__contractRequirements>;
assert<
  Equals<Extract<ThirdRequirements, { firstAutomationService: string }>, never>
>();
assert<
  Equals<Extract<ThirdRequirements, { firstGuardService: string }>, never>
>();
assert<
  Equals<
    Extract<ThirdRequirements, { secondAutomationService: string }>,
    { secondAutomationService: string }
  >
>();
assert<
  Equals<
    Extract<ThirdRequirements, { secondGuardService: string }>,
    { secondGuardService: string }
  >
>();

function rejectedCalls() {
  updateAggregateActorVersion(actorV1, {
    version: '1.1.0',
    // @ts-expect-error The actor does not authenticate the required secret.
    contracts: { needsSecret },
  });
  updateAggregateActorVersion(actorV1, {
    version: '2.0.0',
    db: dbV2,
    queries: { item: queryV2 },
    // @ts-expect-error A contract must use the selected database's models.
    contracts: { oldItem: oldItemContract },
  });
  updateAggregateActorVersion(actorV1, {
    version: '1.1.0',
    // @ts-expect-error Selection keys must name models in the selected database.
    queries: { absent: queryV1 },
  });
  updateAggregateActorVersion(actorV1, {
    version: '1.1.0',
    // @ts-expect-error Selections must return complete arrays of model rows.
    queries: { item: dbV1.query.item.findFirst() },
  });
  const withoutAggregateId = makeActorIdentity({
    schema: Schema.Struct({ subject: Schema.String }),
    actorPath: RoutePattern.parse('/:subject'),
  });
  updateAggregateActorVersion(actorV1, {
    // @ts-expect-error Aggregate actor identity requires aggregateId.
    version: '1.1.0',
    // @ts-expect-error The override does not supply aggregateId.
    identity: withoutAggregateId,
  });
}
void rejectedCalls;

describe('updateAggregateActorVersion', () => {
  it('inherits omitted entries and replaces supplied entries', () => {
    expect(actorV2.db).toBe(dbV2);
    expect(actorV2.identity).toBe(replacementIdentity);
    expect(actorV2.contracts.ping).toBe(pingV2);
    expect(actorV2.contracts.pong).toBe(pong);
    expect(actorV2.automations.first).toBe(firstAutomation);
    expect(actorV2.automations.second).toBe(secondAutomation);
    expect(actorV2.guards.ping).toBe(actorV1.guards.ping);
    expect(actorV2.guards.pong).toBeTypeOf('function');
    expect(actorV2.authorize).not.toBe(actorV1.authorize);
  });

  it('keeps maps when empty maps are supplied', () => {
    const inherited = updateAggregateActorVersion(actorV1, {
      version: '1.1.0',
      queries: {},
      contracts: {},
      automations: {},
      guards: {},
    });
    expect(inherited.db).toBe(dbV1);
    expect(inherited.identity).toBe(identity);
    expect(inherited.queries.item).toBe(actorV1.queries.item);
    expect(inherited.contracts.ping).toBe(pingV1);
    expect(inherited.automations.first).toBe(firstAutomation);
    expect(inherited.guards.ping).toBe(actorV1.guards.ping);
    expect(inherited.authorize).toBe(actorV1.authorize);
  });

  it('replaces existing automation and guard entries by key', () => {
    expect(actorV3.automations.first).toBe(replacementFirstAutomation);
    expect(actorV3.automations.second).toBe(secondAutomation);
    expect(actorV3.guards.ping).toBe(replacementPingGuard);
    expect(actorV3.guards.pong).toBe(actorV2.guards.pong);
    expect(actorV3.authorize).toBe(actorV2.authorize);
  });

  it('rejects a query from another actor database', () => {
    expect(() =>
      updateAggregateActorVersion(actorV1, {
        version: '2.0.0',
        db: dbV2,
        queries: { item: dbV1.query.item.findMany() },
      }),
    ).toThrow('Selection item must query its actor database model');
  });

  it('rejects incompatible contract and automation declarations', () => {
    expect(() =>
      updateAggregateActorVersion(actorV1, {
        version: '1.1.0',
        // @ts-expect-error The actor cannot supply the required secret.
        contracts: { needsSecret },
      }),
    ).toThrow('Actor cannot supply identity claim secret');
    expect(() =>
      updateAggregateActorVersion(actorV1, {
        version: '2.0.0',
        db: dbV2,
        queries: { item: queryV2 },
        // @ts-expect-error The contract belongs to the previous database model.
        contracts: { oldItem: oldItemContract },
      }),
    ).toThrow('must belong to its database');
    expect(() =>
      updateAggregateActorVersion(actorV2, {
        version: '2.1.0',
        automations: { oldItemAutomation: incompatibleAutomation },
      }),
    ).toThrow('must belong to its actor database');
  });

  it('requires a constructed previous actor', () => {
    expect(() =>
      updateAggregateActorVersion(Object.assign({}, actorV1), {
        version: '1.1.0',
      }),
    ).toThrow();
  });

  it('rejects undeclared update fields', () => {
    expect(() =>
      updateAggregateActorVersion(
        actorV1,
        Object.assign({ version: '1.1.0' }, { extra: true }),
      ),
    ).toThrow();
  });
});
