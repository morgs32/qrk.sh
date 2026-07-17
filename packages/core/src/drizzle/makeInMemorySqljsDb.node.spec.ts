import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { mainModels, User } from '../fixtures/system.ts';

import { makeResourceDbConfig } from './makeDbConfig.ts';
import { makeMigratedInMemorySqljsDb } from './makeMigratedInMemorySqljsDb.ts';

const testUserId = 'usr_testsqljsadapter01' as const;
const testActorId = 'actr_testsqljsadapter' as const;

describe('makeInMemorySqljsDb', () => {
  it.effect('migrates and supports sync run/get APIs', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

      const now = new Date('2020-01-01T00:00:00.000Z');

      db.insert(User.drizzleSchema)
        .values({
          id: testUserId,
          modelName: User.modelName,
          createdAt: now,
          updatedAt: now,
          version: User.version,
          actorId: testActorId,
          name: 'Alice',
        })
        .run();

      const row = db
        .select()
        .from(User.drizzleSchema)
        .where(eq(User.drizzleSchema.id, testUserId))
        .get();

      expect(row).toEqual({
        id: testUserId,
        modelName: User.modelName,
        createdAt: now,
        updatedAt: now,
        version: User.version,
        actorId: testActorId,
        name: 'Alice',
      });
    }).pipe(Effect.provide(AsyncLive)),
  );
});
