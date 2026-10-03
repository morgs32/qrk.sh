import { RoutePattern } from '@remix-run/route-pattern';
import { makeAggregateVersion } from '@zerospin/core/aggregate/make/makeAggregateVersion';
import { makeAggregateActorVersion } from '@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { mapContractVersion } from '@zerospin/core/contracts/make/mapContractVersion';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { ActorError } from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import { Effect, ManagedRuntime, Schema } from 'effect';

export const stagingCalls = { guard: 0, program: 0, mapper: 0 };
export const bucket = makeModelVersion(
  defineModel({ name: 'bucket', abbreviation: 'bkt' }),
  {
    version: '1.0.0',
    attributes: { active: primitives.boolean() },
    indexes: [],
  },
);
export const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: {
      name: primitives.text(),
      amount: primitives.integer(),
      bucketId: primitives.ref({
        table: bucket.table,
        relation: 'bucket',
        inverse: 'items',
      }),
    },
    indexes: [],
  },
);
const models = { bucket, item };
const change = makeContractVersion(defineContract('change'), {
  version: '1.0.0',
  models,
  payload: {
    amount: primitives.integer(),
    expected: primitives.integer(),
    create: primitives.boolean(),
    active: primitives.boolean(),
  },
  failures: { rejected: ActorError.schema({ code: 'rejected' }) },
  program: ({ payload, models }) =>
    Effect.gen(function* () {
      stagingCalls.program++;
      yield* models.item.update({
        resourceId: 'itm_one',
        attributes: { amount: payload.amount },
      });
      yield* models.bucket.update({
        resourceId: 'bkt_hidden',
        attributes: { active: payload.active },
      });
      if (payload.create) {
        yield* models.item.create({
          resourceId: `itm_${crypto.randomUUID()}`,
          attributes: {
            name: 'prepared',
            amount: payload.amount,
            bucketId: 'bkt_hidden',
          },
        });
      }
    }),
});
const mapped = mapContractVersion({
  contractVersion: change,
  operations: { models, contracts: {} },
  result: Schema.Null,
  program: () =>
    Effect.sync(() => {
      stagingCalls.mapper++;
      return null;
    }),
});
const actorDb = makeActorDbVersion({ models });
export const actor = makeAggregateActorVersion(
  { name: 'operator' },
  {
    version: '1.0.0',
    authentication: 'none',
    identity: makeActorIdentity({
      claims: Schema.Struct({ aggregateId: Schema.String }),
      actorPath: RoutePattern.parse('/'),
    }),
    db: actorDb,
    selections: {
      item: actorDb.query.item.findMany({
        where: { bucket: { active: true } },
      }),
    },
    contracts: { change: mapped },
    guards: {
      change: ({ db, payload, failures }) =>
        Effect.gen(function* () {
          stagingCalls.guard++;
          const current = db.query.item
            .findFirst({ where: { id: 'itm_one' } })
            .sync();
          if (current?.amount !== payload.expected) {
            return yield* failures.rejected.make();
          }
        }),
    },
  },
);
export const aggregate = makeAggregateVersion(
  { name: 'staging' },
  {
    version: '1.0.0',
    models,
    contracts: { change: mapped },
    actors: { operator: actor },
  },
);
export const stagingKey = {
  systemId: 'sys_fixture',
  aggregateId: 'acct_one',
  aggregateName: 'staging',
  aggregateVersion: '1.0.0',
  actorName: 'operator',
  actorVersion: '1.0.0',
  actorPath: '/',
};
const runtime = ManagedRuntime.make(AsyncLive);
// oxlint-disable-next-line import/no-default-export -- Bundler replacement for the isolated staging fixture.
export default {
  system: {
    name: 'fixture',
    aggregates: { staging: { '1.0.0': aggregate } },
    services: {},
    runtime,
  },
};
