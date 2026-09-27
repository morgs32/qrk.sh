import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { game } from '@zerospin/fixtures/system-worker/workerd/automationFixture';
import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { makeActorSnapshotDb } from './makeActorSnapshotDb.js';

it('opens and provisions an actor snapshot in workerd without a browser location', async () => {
  const rows = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(
          makeResourceDbConfig({ models: { automationGame: game } }),
        );
        return db.query.automationGame.findMany().sync();
      }),
    ).pipe(Effect.provide(AsyncLive)),
  );
  expect(rows).toEqual([]);
});
