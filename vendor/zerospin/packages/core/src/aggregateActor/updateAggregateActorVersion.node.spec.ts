import { RoutePattern } from '@remix-run/route-pattern';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

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
  version: '1.0.0', attributes: { title: primitives.text() }, indexes: [],
});
const itemV2 = makeModelVersion(item, {
  version: '2.0.0', attributes: { title: primitives.text() }, indexes: [],
});
const dbV1 = makeActorDbVersion({ models: { item: itemV1 } });
const dbV2 = makeActorDbVersion({ models: { item: itemV2 } });
const queryV1 = dbV1.query.item.findMany();
const queryV2 = dbV2.query.item.findMany();
const claims = Schema.Struct({ aggregateId: Schema.String });
const identity = makeActorIdentity({ claims, actorPath: RoutePattern.parse('/:aggregateId') });
const nextIdentity = makeActorIdentity({ claims, actorPath: RoutePattern.parse('/:aggregateId') });
const pingV1 = makeContractVersion(defineContract('ping'), {
  version: '1.0.0', payload: {}, models: {},
});
const pingV2 = makeContractVersion(defineContract('ping'), {
  version: '2.0.0', payload: {}, models: {},
});
const pong = makeContractVersion(defineContract('pong'), {
  version: '1.0.0', payload: {}, models: {},
});
const needsSecret = makeContractVersion(defineContract('needsSecret'), {
  version: '1.0.0', payload: {}, models: {},
  claims: Schema.Struct({ aggregateId: Schema.String, secret: Schema.String }),
});
const oldItem = makeContractVersion(defineContract('oldItem'), {
  version: '1.0.0', payload: {}, models: { item: itemV1 },
});
const nextPingGuard = () => Effect.void;
const actorV1 = makeAggregateActorVersion({ name: 'human' }, {
  authentication: 'none', version: '1.0.0', db: dbV1, identity,
  queries: { item: queryV1 }, contracts: { ping: pingV1, pong },
  guards: { ping: () => Effect.void },
});
const actorV2 = updateAggregateActorVersion(actorV1, {
  version: '2.0.0', db: dbV2, identity: nextIdentity,
  queries: { item: queryV2 }, contracts: { ping: pingV2 },
  guards: { pong: () => Effect.void },
});
const actorV3 = updateAggregateActorVersion(actorV2, {
  version: '3.0.0', guards: { ping: nextPingGuard },
});

assert<Equals<typeof actorV2.name, 'human'>>();
assert<Equals<typeof actorV2.version, '2.0.0'>>();
assert<Equals<typeof actorV2.db, typeof dbV2>>();
assert<Equals<typeof actorV2.identity, typeof nextIdentity>>();
assert<Equals<typeof actorV2.contracts.ping, typeof pingV2>>();
assert<Equals<typeof actorV2.contracts.pong, typeof pong>>();
assert<Equals<typeof actorV2.queries.item, typeof queryV2>>();
assert<Equals<typeof actorV3.guards.ping, typeof nextPingGuard>>();

function rejectedCalls() {
  updateAggregateActorVersion(actorV1, {
    version: '1.1.0',
    // @ts-expect-error The actor does not authenticate the required secret.
    contracts: { needsSecret },
  });
  updateAggregateActorVersion(actorV1, {
    version: '2.0.0', db: dbV2, queries: { item: queryV2 },
    // @ts-expect-error A contract must use the selected database's models.
    contracts: { oldItem },
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
}
void rejectedCalls;

describe('updateAggregateActorVersion', () => {
  it('inherits and replaces contract, query, identity, and guard entries', () => {
    expect(actorV2.db).toBe(dbV2);
    expect(actorV2.identity).toBe(nextIdentity);
    expect(actorV2.contracts.ping).toBe(pingV2);
    expect(actorV2.contracts.pong).toBe(pong);
    expect(actorV2.guards.ping).toBe(actorV1.guards.ping);
    expect(actorV3.guards.ping).toBe(nextPingGuard);
    const inherited = updateAggregateActorVersion(actorV1, {
      version: '1.1.0', queries: {}, contracts: {}, guards: {},
    });
    expect(inherited.queries.item).toBe(queryV1);
    expect(inherited.contracts.ping).toBe(pingV1);
    expect(inherited.guards.ping).toBe(actorV1.guards.ping);
  });

  it('rejects a query from another actor database', () => {
    expect(() => updateAggregateActorVersion(actorV1, {
      version: '2.0.0', db: dbV2, queries: { item: dbV1.query.item.findMany() },
    })).toThrow('Selection item must query its actor database model');
  });

  it('rejects incompatible contracts', () => {
    expect(() => updateAggregateActorVersion(actorV1, {
      version: '1.1.0',
      // @ts-expect-error The actor cannot supply the required secret.
      contracts: { needsSecret },
    })).toThrow('Actor cannot supply claim secret');
    expect(() => updateAggregateActorVersion(actorV1, {
      version: '2.0.0', db: dbV2, queries: { item: queryV2 },
      // @ts-expect-error The contract belongs to the previous database model.
      contracts: { oldItem },
    })).toThrow('must belong to its database');
  });

  it('requires a constructed previous actor and declared update fields', () => {
    expect(() => updateAggregateActorVersion(Object.assign({}, actorV1), {
      version: '1.1.0',
    })).toThrow();
    expect(() => updateAggregateActorVersion(
      actorV1, Object.assign({ version: '1.1.0' }, { extra: true }),
    )).toThrow();
  });
});
