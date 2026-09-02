import { it } from '@effect/vitest';
import { primitives } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemorySqljsDb } from '../drizzle/makeProvisionedInMemorySqljsDb.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import { makeModel } from '../models/makeModel.ts';
import { makeReplica } from '../models/makeReplica.ts';

import { applyAggregateMutationTx } from './applyAggregateMutationTx.ts';
import { applyMutationInverseTx } from './applyMutationInverseTx.ts';

const ProductSource = makeModel(
  {
    abbreviation: 'prd',
    modelName: 'product',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
  [],
);
const Product = makeReplica({
  sourceModel: ProductSource,
  serviceName: 'catalog',
});
const dbConfig = makeResourceDbConfig({ models: { product: Product } });

const productId = 'prd_aggregate001';
const createdAt = new Date('2020-01-01T00:00:00.000Z');
const deletedAt = new Date('2020-01-02T00:00:00.000Z');
const revivedAt = new Date('2020-01-03T00:00:00.000Z');

describe('applyAggregateMutationTx', () => {
  it.effect(
    'retains a service tombstone whose inverse restores the live row',
    () =>
      Effect.gen(function* () {
        const db = yield* makeProvisionedInMemorySqljsDb({
          dbConfig,
        });
        db.insert(dbConfig.schema.product)
          .values({
            id: productId,
            modelName: Product.modelName,
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
            version: Product.version,
            name: 'Original',
          })
          .run();

        const mutation = yield* Product.delete('1.0.0', {
          resourceId: productId,
        });
        const applied = yield* makeTx({
          db,
          program: Effect.fn('applyAggregateMutationTxSpec.delete.transaction')(
            function* ({ tx }) {
              return yield* applyAggregateMutationTx({
                tx,
                mutation,
                commandId: 'cmd_aggregate_delete',
                mutationIndex: 0,
                appliedAt: deletedAt,
              });
            },
          ),
        });

        expect(
          db
            .select()
            .from(dbConfig.schema.product)
            .where(eq(dbConfig.schema.product.id, productId))
            .get(),
        ).toMatchObject({
          name: 'Original',
          createdAt,
          updatedAt: deletedAt,
          deletedAt,
        });
        expect(applied.lastAppliedAt).toEqual(createdAt);
        expect(applied.inverseOperation).toEqual({
          resource: expect.objectContaining({
            id: productId,
            name: 'Original',
            updatedAt: createdAt,
            deletedAt: null,
          }),
        });

        yield* makeTx({
          db,
          program: Effect.fn(
            'applyAggregateMutationTxSpec.inverseDelete.transaction',
          )(function* ({ tx }) {
            return yield* applyMutationInverseTx({ tx, mutation: applied });
          }),
        });
        expect(
          db
            .select()
            .from(dbConfig.schema.product)
            .where(eq(dbConfig.schema.product.id, productId))
            .get(),
        ).toMatchObject({
          name: 'Original',
          updatedAt: createdAt,
          deletedAt: null,
        });
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('revives a tombstone with a new create lifetime', () =>
    Effect.gen(function* () {
      const db = yield* makeProvisionedInMemorySqljsDb({
        dbConfig,
      });
      db.insert(dbConfig.schema.product)
        .values({
          id: productId,
          modelName: Product.modelName,
          createdAt,
          updatedAt: deletedAt,
          deletedAt,
          version: Product.version,
          name: 'Original',
        })
        .run();

      const updateMutation = yield* Product.update('1.0.0', {
        resourceId: productId,
        attributes: { name: 'Rejected update' },
      });
      const rejectedUpdate = yield* makeTx({
        db,
        program: Effect.fn(
          'applyAggregateMutationTxSpec.updateTombstone.transaction',
        )(function* ({ tx }) {
          return yield* applyAggregateMutationTx({
            tx,
            mutation: updateMutation,
            commandId: 'cmd_aggregate_update',
            mutationIndex: 0,
            appliedAt: revivedAt,
          }).pipe(Effect.result);
        }),
      });
      expect(rejectedUpdate._tag).toBe('Failure');
      if (rejectedUpdate._tag === 'Failure') {
        expect(rejectedUpdate.failure.code).toBe('service-resource-deleted');
      }

      const moveMutation = yield* Product.move('1.0.0', {
        resourceId: productId,
        property: 'name',
        prevId: 'Original',
        nextId: 'Rejected move',
      });
      const rejectedMove = yield* makeTx({
        db,
        program: Effect.fn(
          'applyAggregateMutationTxSpec.moveTombstone.transaction',
        )(function* ({ tx }) {
          return yield* applyAggregateMutationTx({
            tx,
            mutation: moveMutation,
            commandId: 'cmd_aggregate_move',
            mutationIndex: 0,
            appliedAt: revivedAt,
          }).pipe(Effect.result);
        }),
      });
      expect(rejectedMove._tag).toBe('Failure');
      if (rejectedMove._tag === 'Failure') {
        expect(rejectedMove.failure.code).toBe('service-resource-deleted');
      }

      const deleteMutation = yield* Product.delete('1.0.0', {
        resourceId: productId,
      });
      const rejectedDelete = yield* makeTx({
        db,
        program: Effect.fn(
          'applyAggregateMutationTxSpec.deleteTombstone.transaction',
        )(function* ({ tx }) {
          return yield* applyAggregateMutationTx({
            tx,
            mutation: deleteMutation,
            commandId: 'cmd_aggregate_delete_again',
            mutationIndex: 0,
            appliedAt: revivedAt,
          }).pipe(Effect.result);
        }),
      });
      expect(rejectedDelete._tag).toBe('Failure');
      if (rejectedDelete._tag === 'Failure') {
        expect(rejectedDelete.failure.code).toBe('service-resource-deleted');
      }

      const createMutation = yield* Product.create('1.0.0', {
        resourceId: productId,
        attributes: { name: 'Replacement' },
      });
      const applied = yield* makeTx({
        db,
        program: Effect.fn('applyAggregateMutationTxSpec.create.transaction')(
          function* ({ tx }) {
            return yield* applyAggregateMutationTx({
              tx,
              mutation: createMutation,
              commandId: 'cmd_aggregate_recreate',
              mutationIndex: 0,
              appliedAt: revivedAt,
            });
          },
        ),
      });

      expect(applied.lastAppliedAt).toBeNull();
      expect(applied.inverseOperation).toBeNull();
      expect(
        db
          .select()
          .from(dbConfig.schema.product)
          .where(eq(dbConfig.schema.product.id, productId))
          .get(),
      ).toMatchObject({
        name: 'Replacement',
        createdAt: revivedAt,
        updatedAt: revivedAt,
        deletedAt: null,
        version: Product.version,
      });
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('revives and rolls back a tombstone with a live replication', () =>
    Effect.gen(function* () {
      const db = yield* makeProvisionedInMemorySqljsDb({
        dbConfig,
      });
      db.insert(dbConfig.schema.product)
        .values({
          id: productId,
          modelName: Product.modelName,
          createdAt,
          updatedAt: deletedAt,
          deletedAt,
          version: Product.version,
          name: 'Original',
        })
        .run();

      const mutation = yield* Product.replicateResource('1.0.0', {
        resource: {
          id: productId,
          modelName: Product.modelName,
          createdAt: revivedAt,
          updatedAt: revivedAt,
          version: Product.version,
          name: 'Replacement',
        },
      });
      const applied = yield* makeTx({
        db,
        program: Effect.fn(
          'applyAggregateMutationTxSpec.replicate.transaction',
        )(function* ({ tx }) {
          return yield* applyAggregateMutationTx({
            tx,
            mutation,
            commandId: 'cmd_aggregate_replicate',
            mutationIndex: 0,
            appliedAt: revivedAt,
          });
        }),
      });

      expect(
        db
          .select()
          .from(dbConfig.schema.product)
          .where(eq(dbConfig.schema.product.id, productId))
          .get(),
      ).toMatchObject({
        name: 'Replacement',
        createdAt: revivedAt,
        updatedAt: revivedAt,
        deletedAt: null,
      });
      expect(applied.lastAppliedAt).toEqual(deletedAt);
      expect(applied.inverseOperation).toEqual({
        resource: expect.objectContaining({
          id: productId,
          name: 'Original',
          updatedAt: deletedAt,
          deletedAt,
        }),
      });

      yield* makeTx({
        db,
        program: Effect.fn(
          'applyAggregateMutationTxSpec.inverseReplication.transaction',
        )(function* ({ tx }) {
          return yield* applyMutationInverseTx({ tx, mutation: applied });
        }),
      });
      expect(
        db
          .select()
          .from(dbConfig.schema.product)
          .where(eq(dbConfig.schema.product.id, productId))
          .get(),
      ).toMatchObject({
        name: 'Original',
        updatedAt: deletedAt,
        deletedAt,
      });

      const rejectedReplication = yield* makeTx({
        db,
        program: Effect.fn(
          'applyAggregateMutationTxSpec.replicateDeleted.transaction',
        )(function* ({ tx }) {
          return yield* applyAggregateMutationTx({
            tx,
            mutation: {
              ...mutation,
              operation: {
                ...mutation.operation,
                resource: {
                  ...mutation.operation.resource,
                  deletedAt,
                },
              },
            },
            commandId: 'cmd_aggregate_replicate_deleted',
            mutationIndex: 0,
            appliedAt: revivedAt,
          }).pipe(Effect.result);
        }),
      });
      expect(rejectedReplication._tag).toBe('Failure');
      if (rejectedReplication._tag === 'Failure') {
        expect(rejectedReplication.failure.code).toBe(
          'service-resource-deleted',
        );
      }
    }).pipe(Effect.provide(AsyncLive)),
  );
});
