import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/schema';
import { env, runInDurableObject } from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { expect, it } from 'vitest';

import { serviceActorVersionRepoFixedDORepoConfig } from '../ServiceActorVersionRepo/serviceActorVersionRepoFixedDORepoConfig.js';

import { makeDurableDb } from './makeDurableDb.js';

it('decodes durable relational JSON in the active transaction and preserves encoded selects', async () => {
  const config = makeDbConfig({
    tables: {
      decodedQueryEntries: makeTable({
        name: 'decodedQueryEntries',
        shape: {
          id: primitives.integer({ primaryKey: true }),
          payload: primitives.json({
            schema: Schema.Struct({ count: Schema.Number }),
          }),
        },
      }),
    },
  });
  const name = await Effect.runPromise(
    serviceActorVersionRepoFixedDORepoConfig.nameUtils.makeName({
      systemId: env.ZEROSPIN_SYSTEM_ID,
      serviceName: 'app',
      serviceVersion: '1.0.0',
      actorName: 'default',
      actorVersion: '1.0.0',
      actorPath: '/decoded-query-transaction-test',
    }),
  );
  const repo = env.SERVICE_ACTOR_VERSION_REPO.getByName(name);
  await runInDurableObject(repo, async (_instance, state) => {
    state.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS decodedQueryEntries (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)',
    );
    const db = makeDurableDb({ storage: state.storage, dbConfig: config });
    db.delete(config.schema.decodedQueryEntries).run();
    db.transaction(tx => {
      tx.insert(config.schema.decodedQueryEntries)
        .values({ id: 1, payload: '{"count":1}' })
        .run();
      expect(tx.query.decodedQueryEntries.findFirst().sync()?.payload).toEqual({
        count: 1,
      });
      expect(
        tx.select().from(config.schema.decodedQueryEntries).get()?.payload,
      ).toBe('{"count":1}');
    });
    expect(db.query.decodedQueryEntries.findFirst().sync()?.payload).toEqual({
      count: 1,
    });
    expect(() =>
      db.transaction(tx => {
        tx.update(config.schema.decodedQueryEntries)
          .set({ payload: '{"count":2}' })
          .run();
        expect(
          tx.query.decodedQueryEntries.findFirst().sync()?.payload,
        ).toEqual({ count: 2 });
        throw new Error('rollback');
      }),
    ).toThrow('rollback');
    expect(db.query.decodedQueryEntries.findFirst().sync()?.payload).toEqual({
      count: 1,
    });
  });
});
