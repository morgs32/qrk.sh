import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { makeService } from '@zerospin/core/service/make/makeService';
import { serviceMachine } from '@zerospin/fixtures/system-worker/workerd/serviceMachine';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { expect, it } from 'vitest';

import { makeActorSnapshotDb } from '../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';

import { readServiceResources } from './readServiceResources.js';

const service = serviceMachine.versions['1.0.0'];
const key = {
  actorName: '__service',
  actorVersion: service.version,
  actorPath: '/',
};

it('reads a provisioned model with no rows as an empty service graph', async () => {
  const rows = await Effect.runPromise(
    Effect.gen(function* () {
      const { db } = yield* makeActorSnapshotDb(
        makeResourceDbConfig({ models: service.models }),
      );
      return yield* readServiceResources(db, service, key);
    }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
  );
  expect(rows).toEqual([]);
});

it('exports encoded JSON from the private service actor', async () => {
  const item = makeModelVersion(
    defineModel({ name: 'item', abbreviation: 'itm' }),
    {
      version: '1.0.0',
      attributes: {
        payload: primitives.json({
          schema: Schema.Struct({ count: Schema.Number }),
        }),
      },
      indexes: [],
    },
  );
  const jsonService = makeService({
    name: 'jsonService',
    module: { '1.0.0': { models: { item }, contracts: {} } },
  }).versions['1.0.0'];
  if (jsonService === undefined) {
    throw new Error('JSON service version missing');
  }
  const rows = await Effect.runPromise(
    Effect.gen(function* () {
      const config = makeResourceDbConfig({ models: { item } });
      const { db } = yield* makeActorSnapshotDb(config);
      const now = new Date('2026-09-28T00:00:00.000Z');
      db.insert(config.schema.item)
        .values({
          id: 'itm_one',
          modelName: 'item',
          version: '1.0.0',
          createdAt: now,
          updatedAt: now,
          payload: '{"count":2}',
        })
        .run();
      return yield* readServiceResources(db, jsonService, {
        ...key,
        actorVersion: '1.0.0',
      });
    }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
  );
  expect(rows).toEqual([expect.objectContaining({ payload: '{"count":2}' })]);
});
