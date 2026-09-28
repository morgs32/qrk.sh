import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { game } from '@zerospin/fixtures/system-worker/workerd/automationFixture';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
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

it('decodes scratch relational JSON and keeps explicit rows encoded', async () => {
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
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const config = makeResourceDbConfig({ models: { item } });
        const { db } = yield* makeActorSnapshotDb(config);
        db.insert(config.schema.item)
          .values({
            id: 'itm_one',
            modelName: 'item',
            version: '1.0.0',
            createdAt: new Date(),
            updatedAt: new Date(),
            payload: '{"count":1}',
          })
          .run();
        expect(
          db.query.item
            .findFirst({ where: { payload: { eq: { count: 1 } } } })
            .sync()?.payload,
        ).toEqual({ count: 1 });
        expect(db.select().from(config.schema.item).get()?.payload).toBe(
          '{"count":1}',
        );
      }),
    ).pipe(Effect.provide(AsyncLive)),
  );
});
