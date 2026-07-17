import { it } from '@effect/vitest';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemorySqljsDb } from '../drizzle/makeMigratedInMemorySqljsDb.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import { Item, List, mainModels, User } from '../fixtures/system.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';

import { applyMutationInverseTx } from './applyMutationInverseTx.ts';
import { applyMutationTx } from './applyMutationTx.ts';

const testUserId = 'usr_pushedinv001' as const;
const testActorId = 'actr_pushedinv001' as const;
const testListId = 'lst_pushedinv001' as const;
const testItemId = 'tsk_pushedinv001' as const;
const now = new Date('2020-01-01T00:00:00.000Z');
const appliedAt = new Date('2020-01-02T00:00:00.000Z');
const Product = makeServiceModel(
  {
    serviceName: 'catalog',
    abbreviation: 'prd',
    modelName: 'product',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

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
      db.insert(List.drizzleSchema)
        .values({
          id: 'lst_other000001',
          modelName: List.modelName,
          createdAt: now,
          updatedAt: now,
          version: List.version,
          name: 'Other',
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

  it.effect(
    'service delete retains the row, restores through its inverse, and makes deletion terminal',
    () =>
      Effect.gen(function* () {
        const db = yield* makeMigratedInMemorySqljsDb({
          dbConfig: makeResourceDbConfig({ models: { product: Product } }),
        });
        const productId = 'prd_terminal001';
        const createMutation = yield* Product.create('1.0.0', {
          resourceId: productId,
          attributes: { name: 'Original' },
        });
        yield* makeTx({
          db,
          program: Effect.fn('applyMutationTxSpec.createServiceResource')(
            function* ({ tx }) {
              return yield* applyMutationTx({
                tx,
                mutation: createMutation,
                commandId: 'cmd_service_create',
                mutationIndex: 0,
                appliedAt: now,
              });
            },
          ),
        });
        expect(
          db
            .select()
            .from(Product.drizzleSchema)
            .where(eq(Product.drizzleSchema.id, productId))
            .get(),
        ).toMatchObject({ name: 'Original', deletedAt: null });

        const deleteMutation = yield* Product.delete('1.0.0', {
          resourceId: productId,
        });
        const appliedDelete = yield* makeTx({
          db,
          program: Effect.fn('applyMutationTxSpec.deleteServiceResource')(
            function* ({ tx }) {
              return yield* applyMutationTx({
                tx,
                mutation: deleteMutation,
                commandId: 'cmd_service_delete',
                mutationIndex: 0,
                appliedAt,
              });
            },
          ),
        });
        expect(
          db
            .select()
            .from(Product.drizzleSchema)
            .where(eq(Product.drizzleSchema.id, productId))
            .get(),
        ).toMatchObject({
          name: 'Original',
          deletedAt: appliedAt,
          updatedAt: appliedAt,
        });

        yield* makeTx({
          db,
          program: Effect.fn('applyMutationTxSpec.restoreServiceResource')(
            function* ({ tx }) {
              return yield* applyMutationInverseTx({
                tx,
                mutation: appliedDelete,
              });
            },
          ),
        });
        expect(
          db
            .select()
            .from(Product.drizzleSchema)
            .where(eq(Product.drizzleSchema.id, productId))
            .get(),
        ).toMatchObject({
          name: 'Original',
          deletedAt: null,
          updatedAt: now,
        });

        yield* makeTx({
          db,
          program: Effect.fn('applyMutationTxSpec.deleteServiceResourceAgain')(
            function* ({ tx }) {
              return yield* applyMutationTx({
                tx,
                mutation: deleteMutation,
                commandId: 'cmd_service_delete_again',
                mutationIndex: 0,
                appliedAt,
              });
            },
          ),
        });
        const replayedDelete = yield* makeTx({
          db,
          program: Effect.fn('applyMutationTxSpec.replayServiceDelete')(
            function* ({ tx }) {
              return yield* applyMutationTx({
                tx,
                mutation: deleteMutation,
                commandId: 'cmd_service_delete_replay',
                mutationIndex: 0,
                appliedAt,
              });
            },
          ),
        });
        expect(replayedDelete.inverseOperation).toBe(null);

        const differentDelete = yield* makeTx({
          db,
          program: Effect.fn('applyMutationTxSpec.rejectDifferentDelete')(
            function* ({ tx }) {
              return yield* applyMutationTx({
                tx,
                mutation: deleteMutation,
                commandId: 'cmd_service_delete_different',
                mutationIndex: 0,
                appliedAt: new Date('2020-01-03T00:00:00.000Z'),
              }).pipe(Effect.either);
            },
          ),
        });
        expect(differentDelete._tag).toBe('Left');
        if (differentDelete._tag === 'Left') {
          expect(differentDelete.left.code).toBe('service-resource-deleted');
        }

        const updateMutation = yield* Product.update('1.0.0', {
          resourceId: productId,
          attributes: { name: 'Changed' },
        });
        const rejectedUpdate = yield* makeTx({
          db,
          program: Effect.fn('applyMutationTxSpec.rejectDeletedUpdate')(
            function* ({ tx }) {
              return yield* applyMutationTx({
                tx,
                mutation: updateMutation,
                commandId: 'cmd_service_update_deleted',
                mutationIndex: 0,
                appliedAt: new Date('2020-01-03T00:00:00.000Z'),
              }).pipe(Effect.either);
            },
          ),
        });
        expect(rejectedUpdate._tag).toBe('Left');

        const moveMutation = yield* Product.move('1.0.0', {
          resourceId: productId,
          property: 'name',
          prevId: 'Original',
          nextId: 'Changed',
        });
        const rejectedMove = yield* makeTx({
          db,
          program: Effect.fn('applyMutationTxSpec.rejectDeletedMove')(
            function* ({ tx }) {
              return yield* applyMutationTx({
                tx,
                mutation: moveMutation,
                commandId: 'cmd_service_move_deleted',
                mutationIndex: 0,
                appliedAt: new Date('2020-01-03T00:00:00.000Z'),
              }).pipe(Effect.either);
            },
          ),
        });
        expect(rejectedMove._tag).toBe('Left');

        const rejectedCreate = yield* makeTx({
          db,
          program: Effect.fn('applyMutationTxSpec.rejectDeletedCreate')(
            function* ({ tx }) {
              return yield* applyMutationTx({
                tx,
                mutation: createMutation,
                commandId: 'cmd_service_create_deleted',
                mutationIndex: 0,
                appliedAt: new Date('2020-01-03T00:00:00.000Z'),
              }).pipe(Effect.either);
            },
          ),
        });
        expect(rejectedCreate._tag).toBe('Left');
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('maps persisted reference violations with mutation context', () =>
    Effect.gen(function* () {
      const db = yield* makeMigratedInMemorySqljsDb({
        dbConfig: makeResourceDbConfig({ models: mainModels }),
      });
      const invalidItem = yield* Item.create('1.0.0', {
        resourceId: testItemId,
        attributes: { name: 'Orphan', listId: testListId },
      });
      const invalidInsert = yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.rejectOrphanInsert')(
          function* ({ tx }) {
            return yield* applyMutationTx({
              tx,
              mutation: invalidItem,
              commandId: 'cmd_orphan_insert',
              mutationIndex: 0,
              appliedAt,
            }).pipe(Effect.either);
          },
        ),
      });
      expect(invalidInsert._tag).toBe('Left');
      if (invalidInsert._tag === 'Left') {
        expect(invalidInsert.left.code).toBe(
          'mutation-referential-integrity-failed',
        );
        expect(invalidInsert.left.extra).toMatchObject({
          modelName: Item.modelName,
          resourceId: testItemId,
          operationName: 'create',
        });
      }

      const referencedUser = yield* User.create('1.0.0', {
        resourceId: testUserId,
        attributes: { actorId: testActorId, name: 'Referenced' },
      });
      const appliedReferencedUser = yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.createReferencedUser')(
          function* ({ tx }) {
            return yield* applyMutationTx({
              tx,
              mutation: referencedUser,
              commandId: 'cmd_create_referenced_user',
              mutationIndex: 0,
              appliedAt,
            });
          },
        ),
      });
      db.insert(List.drizzleSchema)
        .values({
          id: testListId,
          modelName: List.modelName,
          createdAt: now,
          updatedAt: now,
          version: List.version,
          name: 'Child',
          userId: testUserId,
        })
        .run();
      const deleteUser = yield* User.delete('1.0.0', {
        resourceId: testUserId,
      });
      const invalidDelete = yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.rejectReferencedDelete')(
          function* ({ tx }) {
            return yield* applyMutationTx({
              tx,
              mutation: deleteUser,
              commandId: 'cmd_referenced_delete',
              mutationIndex: 0,
              appliedAt,
            }).pipe(Effect.either);
          },
        ),
      });
      expect(invalidDelete._tag).toBe('Left');
      if (invalidDelete._tag === 'Left') {
        expect(invalidDelete.left.code).toBe(
          'mutation-referential-integrity-failed',
        );
      }

      const invalidInverse = yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.rejectReferencedInverse')(
          function* ({ tx }) {
            return yield* applyMutationInverseTx({
              tx,
              mutation: appliedReferencedUser,
            }).pipe(Effect.either);
          },
        ),
      });
      expect(invalidInverse._tag).toBe('Left');
      if (invalidInverse._tag === 'Left') {
        expect(invalidInverse.left.code).toBe(
          'mutation-referential-integrity-failed',
        );
        expect(invalidInverse.left.extra).toMatchObject({
          modelName: User.modelName,
          resourceId: testUserId,
          operationName: 'create',
        });
      }
    }).pipe(Effect.provide(AsyncLive)),
  );
});
