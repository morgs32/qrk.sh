import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { mainModels } from '../fixtures/system.ts';

import { makeResourceDbConfig } from './makeDbConfig.ts';
import { makeMigratedInMemorySqljsDb } from './makeMigratedInMemorySqljsDb.ts';
import { migrateDb } from './migrateDb.ts';

describe('migrateDb', () => {
  it.effect('is idempotent when the current tables and indexes already exist', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

      yield* migrateDb({ db, schema: dbConfig.schema });
      yield* migrateDb({ db, schema: dbConfig.schema });

      expect(
        db.get(sql`SELECT name FROM sqlite_master WHERE name = 'account'`),
      ).toEqual({ name: 'account' });
      expect(
        db.get(sql`SELECT name FROM sqlite_master WHERE name = 'list'`),
      ).toEqual({ name: 'list' });
      expect(
        db.get(sql`SELECT name FROM sqlite_master WHERE name = 'item'`),
      ).toEqual({ name: 'item' });
      expect(
        db.get(sql`SELECT name FROM sqlite_master WHERE name = 'user'`),
      ).toEqual({ name: 'user' });
    }).pipe(Effect.provide(AsyncLive)),
  );
});
