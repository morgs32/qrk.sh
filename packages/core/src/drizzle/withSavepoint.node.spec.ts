import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { ZerospinError } from '@zerospin/error';
import { Effect, Either } from 'effect';
import { describe, expect } from 'vitest';

import { mainModels, User } from '../fixtures/system.ts';

import { makeResourceDbConfig } from './makeDbConfig.ts';
import { makeMigratedInMemorySqljsDb } from './makeMigratedInMemorySqljsDb.ts';
import { makeTx } from './makeTx.ts';
import { withSavepoint } from './withSavepoint.ts';

describe('withSavepoint', () => {
  it.effect(
    'rolls back a failed savepoint and commits successful siblings',
    () =>
      Effect.gen(function* () {
        const dbConfig = makeResourceDbConfig({ models: mainModels });
        const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });
        const now = new Date('2026-07-11T00:00:00.000Z');

        yield* makeTx({
          db,
          program: Effect.fn('transaction')(function* ({ tx }) {
            const failed = yield* withSavepoint({
              tx,
              program: Effect.fn('failedSavepoint')(function* ({
                tx: savepointTx,
              }) {
                savepointTx
                  .insert(User.drizzleSchema)
                  .values({
                    id: 'usr_savepoint_failed',
                    modelName: User.modelName,
                    createdAt: now,
                    updatedAt: now,
                    version: User.version,
                    actorId: 'actr_savepoint_failed',
                    name: 'Rolled back',
                  })
                  .run();
                return yield* new ZerospinError({
                  code: 'savepoint-command-failed',
                  message: 'Rollback this command only',
                });
              }),
            }).pipe(Effect.either);

            expect(Either.isLeft(failed)).toBe(true);
            if (Either.isLeft(failed)) {
              expect(failed.left.code).toBe('savepoint-command-failed');
            }

            yield* withSavepoint({
              tx,
              program: Effect.fn('successfulSavepoint')(function* ({
                tx: savepointTx,
              }) {
                yield* Effect.void;
                savepointTx
                  .insert(User.drizzleSchema)
                  .values({
                    id: 'usr_savepoint_success',
                    modelName: User.modelName,
                    createdAt: now,
                    updatedAt: now,
                    version: User.version,
                    actorId: 'actr_savepoint_success',
                    name: 'Committed',
                  })
                  .run();
              }),
            });
          }),
        });

        expect(db.select().from(User.drizzleSchema).all()).toEqual([
          expect.objectContaining({
            id: 'usr_savepoint_success',
            name: 'Committed',
          }),
        ]);
      }).pipe(Effect.provide(AsyncLive)),
  );
});
