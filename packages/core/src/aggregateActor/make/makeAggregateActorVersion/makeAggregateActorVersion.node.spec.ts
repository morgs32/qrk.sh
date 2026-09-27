import { RoutePattern } from '@remix-run/route-pattern';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import { makeAutomation } from '../../../automation/makeAutomation.ts';
import { defineContract } from '../../../contracts/defineContract.ts';
import { makeContractVersion } from '../../../contracts/make/makeContractVersion.ts';
import { makeActorIdentity } from '../../../identity/make/makeActorIdentity/makeActorIdentity.ts';
import { makeActorDbVersion } from '../../../models/make/makeActorDbVersion.ts';

import { makeAggregateActorVersion } from './makeAggregateActorVersion.ts';

const db = makeActorDbVersion({ models: {} });
const claims = Schema.Struct({ aggregateId: Schema.String });
const identity = makeActorIdentity({
  schema: claims,
  actorPath: RoutePattern.parse('/:aggregateId'),
});

const actor = makeAggregateActorVersion(
  { name: 'human' },
  {
    authentication: 'none',
    version: '1.0.0',
    db,
    identity,
    queries: {},
    contracts: {},
  },
);
const ping = makeContractVersion(defineContract('ping'), {
  version: '1.0.0',
  payload: {},
  models: {},
});
const automation = makeAutomation({
  name: 'observePing',
  on: ping,
  contracts: {},
  program: () => Effect.succeed(null),
});
assert<Equals<typeof actor.name, 'human'>>();
assert<Equals<typeof actor.version, '1.0.0'>>();
assert<Equals<typeof actor.db, typeof db>>();
assert<Equals<typeof actor.identity, typeof identity>>();
assert<Equals<typeof actor.automations, {}>>();

describe('makeAggregateActorVersion', () => {
  it('retains exact declarations and defaults absent maps to empty maps', () => {
    expect(actor.db).toBe(db);
    expect(actor.identity).toBe(identity);
    expect(actor.queries).toEqual({});
    expect(actor.selections).toEqual({});
    expect(actor.automations).toEqual({});
    expect(actor.guards).toEqual({});
  });

  it('rejects malformed versions', () => {
    expect(() =>
      makeAggregateActorVersion(
        { name: 'human' },
        {
          authentication: 'none',
          version: 'invalid',
          db,
          identity,
          queries: {},
          contracts: {},
        },
      ),
    ).toThrow();
  });

  it('rejects mismatched contract and automation keys', () => {
    expect(() =>
      makeAggregateActorVersion(
        { name: 'human' },
        {
          authentication: 'none',
          version: '1.0.0',
          db,
          identity,
          queries: {},
          // @ts-expect-error Contract registry keys must match command names.
          contracts: { wrong: ping },
        },
      ),
    ).toThrow('Actor contract key wrong must match ping');
    expect(() =>
      makeAggregateActorVersion(
        { name: 'human' },
        {
          authentication: 'none',
          version: '1.0.0',
          db,
          identity,
          queries: {},
          contracts: {},
          automations: { wrong: automation },
        },
      ),
    ).toThrow('Automation key wrong must match observePing');
  });

  it('rejects guards without a declared command', () => {
    expect(() =>
      makeAggregateActorVersion(
        { name: 'human' },
        {
          authentication: 'none',
          version: '1.0.0',
          db,
          identity,
          queries: {},
          contracts: {},
          guards: { missing: () => Effect.void },
        },
      ),
    ).toThrow('Unknown actor guard command missing');
  });

  it('rejects identity without a required string aggregateId', () => {
    const subject = Schema.Struct({ subject: Schema.String });
    const withoutAggregateId = makeActorIdentity({
      schema: subject,
      actorPath: RoutePattern.parse('/:subject'),
    });
    expect(() =>
      makeAggregateActorVersion(
        { name: 'human' },
        {
          authentication: 'none',
          version: '1.0.0',
          db,
          // @ts-expect-error Aggregate actors require aggregateId identity.
          identity: withoutAggregateId,
          queries: {},
          contracts: {},
        },
      ),
    ).toThrow(
      'Actor identitySchema must contain a required string aggregateId',
    );
  });
});
