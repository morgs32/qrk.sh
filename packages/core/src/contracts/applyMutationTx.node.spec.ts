import { it } from '@effect/vitest';
import { primitives } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemorySqljsDb } from '../drizzle/makeProvisionedInMemorySqljsDb.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import { Item, List, mainModels, User } from '../fixtures/system.ts';
import { makeModel } from '../models/makeModel.ts';

import { applyMutationInverseTx } from './applyMutationInverseTx.ts';
import { applyMutationTx } from './applyMutationTx.ts';

const testUserId = 'usr_pushedinv001' as const;
const testListId = 'lst_pushedinv001' as const;
const testItemId = 'tsk_pushedinv001' as const;
const now = new Date('2020-01-01T00:00:00.000Z');
const appliedAt = new Date('2020-01-02T00:00:00.000Z');
const Product = makeModel(
  {
    abbreviation: 'prd',
    modelName: 'product',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
  [],
);
const dbConfig = makeResourceDbConfig({ models: mainModels });
const productDbConfig = makeResourceDbConfig({ models: { product: Product } });

describe('applyMutationTx + applyMutationInverseTx', () => {
  it.effect('create inverse deletes the created row', () =>
    Effect.gen(function* () {
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });

      const mutation = yield* User.create('1.0.0', {
        resourceId: testUserId,
        attributes: { name: 'Alice' },
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
        .from(dbConfig.schema.user)
        .where(eq(dbConfig.schema.user.id, testUserId))
        .get();

      expect(row).toBeUndefined();
      expect(applied.inverseOperation).toBe(null);
      expect(applied.lastAppliedAt).toBe(null);
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('create fails if the row already exists', () =>
    Effect.gen(function* () {
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });

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

      const mutation = yield* User.create('1.0.0', {
        resourceId: testUserId,
        attributes: { name: 'Bob' },
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
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });

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
            }).pipe(Effect.result);
          },
        ),
      });

      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') {
        expect(result.failure.code).toBe('mutation-row-not-found');
      }
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('update inverse restores pre-apply attributes and updatedAt', () =>
    Effect.gen(function* () {
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });

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
        .from(dbConfig.schema.user)
        .where(eq(dbConfig.schema.user.id, testUserId))
        .get();

      expect(row?.name).toBe('Alice');
      expect(row?.updatedAt).toEqual(now);
      expect(applied.inverseOperation).toEqual({
        attributes: { name: 'Alice' },
      });
      expect(applied.lastAppliedAt).toEqual(now);
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('move inverse restores prevId and updatedAt', () =>
    Effect.gen(function* () {
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });

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
      db.insert(dbConfig.schema.list)
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
      db.insert(dbConfig.schema.list)
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
      db.insert(dbConfig.schema.item)
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
        .from(dbConfig.schema.item)
        .where(eq(dbConfig.schema.item.id, testItemId))
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
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });

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
        .from(dbConfig.schema.user)
        .where(eq(dbConfig.schema.user.id, testUserId))
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
        .from(dbConfig.schema.user)
        .where(eq(dbConfig.schema.user.id, testUserId))
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
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });

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
            }).pipe(Effect.result);
          },
        ),
      });

      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') {
        expect(result.failure.code).toBe('mutation-row-not-found');
      }
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'service delete removes the row and allows a later create with the same id',
    () =>
      Effect.gen(function* () {
        const db = yield* makeProvisionedInMemorySqljsDb({
          dbConfig: productDbConfig,
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
            .from(productDbConfig.schema.product)
            .where(eq(productDbConfig.schema.product.id, productId))
            .get(),
        ).toMatchObject({ name: 'Original' });

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
            .from(productDbConfig.schema.product)
            .where(eq(productDbConfig.schema.product.id, productId))
            .get(),
        ).toBeUndefined();
        expect(appliedDelete.lastAppliedAt).toEqual(now);
        expect(appliedDelete.inverseOperation).toEqual({
          resource: expect.objectContaining({
            id: productId,
            name: 'Original',
          }),
        });

        const missingDelete = yield* makeTx({
          db,
          program: Effect.fn(
            'applyMutationTxSpec.deleteMissingServiceResource',
          )(function* ({ tx }) {
            return yield* applyMutationTx({
              tx,
              mutation: deleteMutation,
              commandId: 'cmd_service_delete_missing',
              mutationIndex: 0,
              appliedAt: new Date('2020-01-03T00:00:00.000Z'),
            }).pipe(Effect.result);
          }),
        });
        expect(missingDelete._tag).toBe('Failure');
        if (missingDelete._tag === 'Failure') {
          expect(missingDelete.failure.code).toBe('mutation-row-not-found');
        }

        const recreatedAt = new Date('2020-01-04T00:00:00.000Z');
        const recreateMutation = yield* Product.create('1.0.0', {
          resourceId: productId,
          attributes: { name: 'Replacement' },
        });
        yield* makeTx({
          db,
          program: Effect.fn('applyMutationTxSpec.recreateServiceResource')(
            function* ({ tx }) {
              return yield* applyMutationTx({
                tx,
                mutation: recreateMutation,
                commandId: 'cmd_service_recreate',
                mutationIndex: 0,
                appliedAt: recreatedAt,
              });
            },
          ),
        });
        expect(
          db
            .select()
            .from(productDbConfig.schema.product)
            .where(eq(productDbConfig.schema.product.id, productId))
            .get(),
        ).toMatchObject({
          name: 'Replacement',
          createdAt: recreatedAt,
          updatedAt: recreatedAt,
          version: Product.version,
        });
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('maps persisted reference violations with mutation context', () =>
    Effect.gen(function* () {
      const db = yield* makeProvisionedInMemorySqljsDb({
        dbConfig,
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
            }).pipe(Effect.result);
          },
        ),
      });
      expect(invalidInsert._tag).toBe('Failure');
      if (invalidInsert._tag === 'Failure') {
        expect(invalidInsert.failure.code).toBe(
          'mutation-referential-integrity-failed',
        );
        expect(invalidInsert.failure.extra).toMatchObject({
          modelName: Item.modelName,
          resourceId: testItemId,
          operationName: 'create',
        });
      }

      const referencedUser = yield* User.create('1.0.0', {
        resourceId: testUserId,
        attributes: { name: 'Referenced' },
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
      db.insert(dbConfig.schema.list)
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
            }).pipe(Effect.result);
          },
        ),
      });
      expect(invalidDelete._tag).toBe('Failure');
      if (invalidDelete._tag === 'Failure') {
        expect(invalidDelete.failure.code).toBe(
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
            }).pipe(Effect.result);
          },
        ),
      });
      expect(invalidInverse._tag).toBe('Failure');
      if (invalidInverse._tag === 'Failure') {
        expect(invalidInverse.failure.code).toBe(
          'mutation-referential-integrity-failed',
        );
        expect(invalidInverse.failure.extra).toMatchObject({
          modelName: User.modelName,
          resourceId: testUserId,
          operationName: 'create',
        });
      }
    }).pipe(Effect.provide(AsyncLive)),
  );
});
