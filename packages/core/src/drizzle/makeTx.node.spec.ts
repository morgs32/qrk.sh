import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { ZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { mainModels, User } from '../fixtures/system.ts';

import { makeResourceDbConfig } from './makeDbConfig.ts';
import { makeProvisionedInMemorySqljsDb } from './makeProvisionedInMemorySqljsDb.ts';
import { makeTx } from './makeTx.ts';

const testUserId = 'usr_maketxcommit001' as const;
const testUserIdRollback = 'usr_maketxrollback1' as const;

describe('makeTx', () => {
  it.effect('commits on success', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });

      const now = new Date('2020-01-01T00:00:00.000Z');

      yield* makeTx({
        db,
        program: Effect.fn('transaction')(function* ({ tx }) {
          yield* Effect.void;
          tx.insert(dbConfig.schema.user)
            .values({
              id: testUserId,
              modelName: User.modelName,
              createdAt: now,
              updatedAt: now,
              version: User.version,
              name: 'Alice',
            })
            .run();
        }),
      });

      const row = db
        .select()
        .from(dbConfig.schema.user)
        .where(eq(dbConfig.schema.user.id, testUserId))
        .get();

      expect(row?.name).toBe('Alice');
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('rolls back on failure', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });

      const now = new Date('2020-01-01T00:00:00.000Z');

      const exit = yield* makeTx({
        db,
        program: Effect.fn('transaction')(function* ({ tx }) {
          tx.insert(dbConfig.schema.user)
            .values({
              id: testUserIdRollback,
              modelName: User.modelName,
              createdAt: now,
              updatedAt: now,
              version: User.version,
              name: 'Bob',
            })
            .run();
          return yield* new ZerospinError({
            code: 'make-tx-rollback-test',
            message: 'Rollback this transaction',
          });
        }),
      }).pipe(Effect.exit);

      expect(exit._tag).toBe('Failure');

      const row = db
        .select()
        .from(dbConfig.schema.user)
        .where(eq(dbConfig.schema.user.id, testUserIdRollback))
        .get();

      expect(row).toBeUndefined();
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('rejects nested makeTx', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });

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

  it.effect('preserves a domain failure while rolling back', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });
      const now = new Date('2020-01-01T00:00:00.000Z');

      const failure = yield* makeTx({
        db,
        program: Effect.fn('domainFailureTransaction')(function* ({ tx }) {
          tx.insert(dbConfig.schema.user)
            .values({
              id: 'usr_maketxdomainfail',
              modelName: User.modelName,
              createdAt: now,
              updatedAt: now,
              version: User.version,
              name: 'Rolled back domain failure',
            })
            .run();
          return yield* new ZerospinError({
            code: 'make-tx-domain-failure',
            message: 'Preserve this transaction domain failure',
          });
        }),
      }).pipe(Effect.flip);

      expect(failure.code).toBe('make-tx-domain-failure');
      expect(
        db
          .select()
          .from(dbConfig.schema.user)
          .where(eq(dbConfig.schema.user.id, 'usr_maketxdomainfail'))
          .get(),
      ).toBeUndefined();
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('smoke: frontend call-site shape with ITx program', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });

      yield* makeTx({
        db,
        program: Effect.fn('transaction')(function* ({ tx: _tx }) {
          yield* Effect.void;
        }),
      });
    }).pipe(Effect.provide(AsyncLive)),
  );
});
