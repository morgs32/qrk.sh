import { it } from '@effect/vitest';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemorySqljsDb } from '../drizzle/makeMigratedInMemorySqljsDb.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import { Item, List, mainModels, User } from '../fixtures/system.ts';

import { applyMutationInverseTx } from './applyMutationInverseTx.ts';
import { applyMutationTx } from './applyMutationTx.ts';

const testUserId = 'usr_pushedinv001' as const;
const testActorId = 'actr_pushedinv001' as const;
const testListId = 'lst_pushedinv001' as const;
const testItemId = 'tsk_pushedinv001' as const;
const now = new Date('2020-01-01T00:00:00.000Z');
const appliedAt = new Date('2020-01-02T00:00:00.000Z');

describe('applyMutationTx + applyMutationInverseTx', () => {
  it.effect('create inverse deletes the created row', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

      const mutation = yield* User.create('1.0.0', {
        resourceId: testUserId,
        attributes: { actorId: testActorId, name: 'Alice' },
      });

      const applied = yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.applyCreate.transaction')(
          function* ({ tx }) {
            return yield* applyMutationTx({
              tx,
              mutation,
              commandId: 'cmd_pushedinv001',
              mutationIndex: 0,
              appliedAt,
            });
          },
        ),
      });
      yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.inverseCreate.transaction')(
          function* ({ tx }) {
            return yield* applyMutationInverseTx({ tx, mutation: applied });
          },
        ),
      });

      const row = db
        .select()
        .from(User.drizzleSchema)
        .where(eq(User.drizzleSchema.id, testUserId))
        .get();

      expect(row).toBeUndefined();
      expect(applied.inverseOperation).toBe(null);
      expect(applied.lastAppliedAt).toBe(null);
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('create fails if the row already exists', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

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

      const mutation = yield* User.create('1.0.0', {
        resourceId: testUserId,
        attributes: { actorId: testActorId, name: 'Bob' },
      });

      const exit = yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.failCreate.transaction')(
          function* ({ tx }) {
            return yield* applyMutationTx({
              tx,
              mutation,
              commandId: 'cmd_pushedinv001',
              mutationIndex: 0,
              appliedAt,
            });
          },
        ),
      }).pipe(Effect.exit);

      expect(exit._tag).toBe('Failure');
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('update fails if the resource row is missing', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

      const mutation = yield* User.update('1.0.0', {
        resourceId: testUserId,
        attributes: { name: 'Bob' },
      });

      const result = yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.missingUpdate.transaction')(
          function* ({ tx }) {
            return yield* applyMutationTx({
              tx,
              mutation,
              commandId: 'cmd_pushedinv001',
              mutationIndex: 0,
              appliedAt,
            }).pipe(Effect.either);
          },
        ),
      });

      expect(result._tag).toBe('Left');
      if (result._tag === 'Left') {
        expect(result.left.code).toBe('mutation-row-not-found');
      }
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('update inverse restores pre-apply attributes and updatedAt', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

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

      const mutation = yield* User.update('1.0.0', {
        resourceId: testUserId,
        attributes: { name: 'Bob' },
      });

      const applied = yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.applyUpdate.transaction')(
          function* ({ tx }) {
            return yield* applyMutationTx({
              tx,
              mutation,
              commandId: 'cmd_pushedinv001',
              mutationIndex: 0,
              appliedAt,
            });
          },
        ),
      });
      yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.inverseUpdate.transaction')(
          function* ({ tx }) {
            return yield* applyMutationInverseTx({ tx, mutation: applied });
          },
        ),
      });

      const row = db
        .select()
        .from(User.drizzleSchema)
        .where(eq(User.drizzleSchema.id, testUserId))
        .get();

      expect(row?.name).toBe('Alice');
      expect(row?.updatedAt).toEqual(now);
      expect(applied.inverseOperation).toEqual({
        attributes: { actorId: testActorId, name: 'Alice' },
      });
      expect(applied.lastAppliedAt).toEqual(now);
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('move inverse restores prevId and updatedAt', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

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
      db.insert(List.drizzleSchema)
        .values({
          id: testListId,
          modelName: List.modelName,
          createdAt: now,
          updatedAt: now,
          version: List.version,
          name: 'Groceries',
          userId: testUserId,
        })
        .run();
      db.insert(Item.drizzleSchema)
        .values({
          id: testItemId,
          modelName: Item.modelName,
          createdAt: now,
          updatedAt: now,
          version: Item.version,
          name: 'Milk',
          listId: testListId,
        })
        .run();

      const mutation = yield* Item.move('1.0.0', {
        resourceId: testItemId,
        property: 'listId',
        prevId: testListId,
        nextId: 'lst_other000001',
      });

      const applied = yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.applyMove.transaction')(
          function* ({ tx }) {
            return yield* applyMutationTx({
              tx,
              mutation,
              commandId: 'cmd_pushedinv001',
              mutationIndex: 0,
              appliedAt,
            });
          },
        ),
      });
      yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.inverseMove.transaction')(
          function* ({ tx }) {
            return yield* applyMutationInverseTx({ tx, mutation: applied });
          },
        ),
      });

      const row = db
        .select()
        .from(Item.drizzleSchema)
        .where(eq(Item.drizzleSchema.id, testItemId))
        .get();

      expect(row?.listId).toBe(testListId);
      expect(row?.updatedAt).toEqual(now);
      expect(applied.inverseOperation).toEqual({
        property: 'listId',
        prevId: testListId,
      });
      expect(applied.lastAppliedAt).toEqual(now);
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('delete removes the row and its inverse restores it', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

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

      const mutation = yield* User.delete('1.0.0', {
        resourceId: testUserId,
      });

      const applied = yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.applyDelete.transaction')(
          function* ({ tx }) {
            return yield* applyMutationTx({
              tx,
              mutation,
              commandId: 'cmd_pushedinv001',
              mutationIndex: 0,
              appliedAt,
            });
          },
        ),
      });

      const deletedRow = db
        .select()
        .from(User.drizzleSchema)
        .where(eq(User.drizzleSchema.id, testUserId))
        .get();
      expect(deletedRow).toBeUndefined();
      expect(applied.lastAppliedAt).toEqual(now);
      expect(applied.inverseOperation).toEqual({
        resource: expect.objectContaining({
          id: testUserId,
          name: 'Alice',
        }),
      });

      yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.inverseDelete.transaction')(
          function* ({ tx }) {
            return yield* applyMutationInverseTx({ tx, mutation: applied });
          },
        ),
      });

      const restoredRow = db
        .select()
        .from(User.drizzleSchema)
        .where(eq(User.drizzleSchema.id, testUserId))
        .get();
      expect(restoredRow).toEqual(
        expect.objectContaining({
          id: testUserId,
          name: 'Alice',
        }),
      );
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('delete fails when the row is missing', () =>
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({ models: mainModels });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

      const mutation = yield* User.delete('1.0.0', {
        resourceId: testUserId,
      });

      const result = yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.deleteMissing.transaction')(
          function* ({ tx }) {
            return yield* applyMutationTx({
              tx,
              mutation,
              commandId: 'cmd_pushedinv001',
              mutationIndex: 0,
              appliedAt,
            }).pipe(Effect.either);
          },
        ),
      });

      expect(result._tag).toBe('Left');
      if (result._tag === 'Left') {
        expect(result.left.code).toBe('mutation-row-not-found');
      }
    }).pipe(Effect.provide(AsyncLive)),
  );
});
