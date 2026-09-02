import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { eq, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { List, mainModels, User } from '../fixtures/system.ts';

import { makeResourceDbConfig } from './makeDbConfig.ts';
import { makeProvisionedInMemorySqljsDb } from './makeProvisionedInMemorySqljsDb.ts';

const testUserId = 'usr_testsqljsadapter01' as const;

describe('makeInMemorySqljsDb', () => {
  it.effect('provisions and supports sync run/get APIs', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });

      const now = new Date('2020-01-01T00:00:00.000Z');

      expect(
        db.get<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`),
      ).toEqual({ foreign_keys: 1 });

      expect(() =>
        db
          .insert(dbConfig.schema.list)
          .values({
            id: 'lst_testsqljsorphan01',
            modelName: List.modelName,
            createdAt: now,
            updatedAt: now,
            version: List.version,
            name: 'Orphan list',
            userId: 'usr_testsqljsmissing1',
          })
          .run(),
      ).toThrow('Failed query:');

      db.insert(dbConfig.schema.user)
        .values({
          id: testUserId,
          modelName: User.modelName,
          createdAt: now,
          updatedAt: now,
          version: User.version,
          name: 'Alice',
        })
        .run();

      const row = db
        .select()
        .from(dbConfig.schema.user)
        .where(eq(dbConfig.schema.user.id, testUserId))
        .get();

      expect(row).toEqual({
        id: testUserId,
        modelName: User.modelName,
        createdAt: now,
        updatedAt: now,
        version: User.version,
        name: 'Alice',
      });
    }).pipe(Effect.provide(AsyncLive)),
  );
});
