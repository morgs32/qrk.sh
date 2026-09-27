import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { serviceAutomation } from '@zerospin/fixtures/system-worker/workerd/serviceAutomation';
import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { makeActorSnapshotDb } from '../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';

import { readServiceResources } from './readServiceResources.js';

const service = serviceAutomation.versions['1.0.0'];
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

it('reports the required model name when its query is missing', async () => {
  const error = await Effect.runPromise(
    Effect.gen(function* () {
      const { db } = yield* makeActorSnapshotDb(
        makeResourceDbConfig({ models: {} }),
      );
      return yield* readServiceResources(db, service, key).pipe(Effect.flip);
    }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
  );
  expect(error).toMatchObject({
    code: 'service-model-query-not-found',
    message: 'Missing service model query: job',
  });
});
