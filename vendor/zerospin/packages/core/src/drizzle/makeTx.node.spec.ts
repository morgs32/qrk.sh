import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { mainModels, User } from '../fixtures/system.ts';

import { makeResourceDbConfig } from './makeDbConfig.ts';
import { makeMigratedInMemorySqljsDb } from './makeMigratedInMemorySqljsDb.ts';
import { makeTx } from './makeTx.ts';

const testUserId = 'usr_maketxcommit001' as const;
const testActorId = 'actr_maketxcommit01' as const;
const testUserIdRollback = 'usr_maketxrollback1' as const;
const testActorIdRollback = 'actr_maketxrollback' as const;

describe('makeTx', () => {
  it.effect('commits on success', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

      const now = new Date('2020-01-01T00:00:00.000Z');

      yield* makeTx({
        db,
        program: Effect.fn('transaction')(function* ({ tx }) {
          yield* Effect.void;
          tx.insert(User.drizzleSchema)
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
        }),
      });

      const row = db
        .select()
        .from(User.drizzleSchema)
        .where(eq(User.drizzleSchema.id, testUserId))
        .get();

      expect(row?.name).toBe('Alice');
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('rolls back on failure', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

      const now = new Date('2020-01-01T00:00:00.000Z');

      const exit = yield* makeTx({
        db,
        program: Effect.fn('transaction')(function* ({ tx }) {
          tx.insert(User.drizzleSchema)
            .values({
              id: testUserIdRollback,
              modelName: User.modelName,
              createdAt: now,
              updatedAt: now,
              version: User.version,
              actorId: testActorIdRollback,
              name: 'Bob',
            })
            .run();
          return yield* Effect.fail('rollback-me');
        }),
      }).pipe(Effect.exit);

      expect(exit._tag).toBe('Failure');

      const row = db
        .select()
        .from(User.drizzleSchema)
        .where(eq(User.drizzleSchema.id, testUserIdRollback))
        .get();

      expect(row).toBeUndefined();
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('rejects nested makeTx', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

      const exit = yield* makeTx({
        db,
        program: Effect.fn('transaction')(function* ({ tx: _tx }) {
          return yield* makeTx({
            db,
            program: Effect.fn('nestedTransaction')(function* ({
              tx: _nestedTx,
            }) {
              yield* Effect.void;
            }),
          });
        }),
      }).pipe(Effect.exit);

      expect(exit._tag).toBe('Failure');
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('smoke: SharedWorker call-site shape with ITx program', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

      yield* makeTx({
        db,
        program: Effect.fn('transaction')(function* ({ tx: _tx }) {
          yield* Effect.void;
        }),
      });
    }).pipe(Effect.provide(AsyncLive)),
  );
});
