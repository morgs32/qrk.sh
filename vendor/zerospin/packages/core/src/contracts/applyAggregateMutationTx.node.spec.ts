import { it } from '@effect/vitest';
import { primitives } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Context, Effect } from 'effect';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemorySqljsDb } from '../drizzle/makeProvisionedInMemorySqljsDb.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type { IDbConfig, ITx } from '../drizzle/types.ts';
import { models } from '../models/index.ts';
import { makeReplica } from '../models/makeReplica.ts';

import { applyAggregateMutationTx } from './applyAggregateMutationTx.ts';
import { applyMutationInverseTx } from './applyMutationInverseTx.ts';
import { makeModelMutations } from './makeModelMutations.ts';

const ProductSource = models.makeVersion(
  models.makeModel({ name: 'product', abbreviation: 'prd' }),
  {
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);
const Product = makeReplica({
  sourceModel: ProductSource,
  modelVersion: ProductSource.version,
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

        const mutation = yield* makeModelMutations(Product).delete({
          resourceId: productId,
        });
        class Db extends Context.Service<Db, typeof db>()(
          'core/src/contracts/applyAggregateMutationTx.node.spec/Db',
        ) {
          static readonly Tx = Context.Service<
            'core/src/contracts/applyAggregateMutationTx.node.spec/Db.Tx',
            ITx<IDbConfig<IDbConfig['schema'], (typeof db)['_']['relations']>>
          >('core/src/contracts/applyAggregateMutationTx.node.spec/Db.Tx');
        }

        const applied = yield* makeTx(
          'applyAggregateMutationTxSpec.delete.transaction',
          Db,
        )(function* () {
          const tx = yield* Db.Tx;
          return yield* applyAggregateMutationTx({
            tx,
            mutation,
            commandId: 'cmd_aggregate_delete',
            mutationIndex: 0,
            appliedAt: deletedAt,
          });
        })().pipe(Effect.provideService(Db, db));

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

        yield* makeTx(
          'applyAggregateMutationTxSpec.inverseDelete.transaction',
          Db,
        )(function* () {
          const tx = yield* Db.Tx;
          return yield* applyMutationInverseTx({ tx, mutation: applied });
        })().pipe(Effect.provideService(Db, db));
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

      const updateMutation = yield* makeModelMutations(Product).update({
        resourceId: productId,
        attributes: { name: 'Rejected update' },
      });
      class Db extends Context.Service<Db, typeof db>()(
        'core/src/contracts/applyAggregateMutationTx.node.spec/Db',
      ) {
        static readonly Tx = Context.Service<
          'core/src/contracts/applyAggregateMutationTx.node.spec/Db.Tx',
          ITx<IDbConfig<IDbConfig['schema'], (typeof db)['_']['relations']>>
        >('core/src/contracts/applyAggregateMutationTx.node.spec/Db.Tx');
      }

      const rejectedUpdate = yield* makeTx(
        'applyAggregateMutationTxSpec.updateTombstone.transaction',
        Db,
      )(function* () {
        const tx = yield* Db.Tx;
        return yield* applyAggregateMutationTx({
          tx,
          mutation: updateMutation,
          commandId: 'cmd_aggregate_update',
          mutationIndex: 0,
          appliedAt: revivedAt,
        }).pipe(Effect.result);
      })().pipe(Effect.provideService(Db, db));
      expect(rejectedUpdate._tag).toBe('Failure');
      if (rejectedUpdate._tag === 'Failure') {
        expect(rejectedUpdate.failure.code).toBe('service-resource-deleted');
      }

      const moveMutation = yield* makeModelMutations(Product).move({
        resourceId: productId,
        property: 'name',
        prevId: 'Original',
        nextId: 'Rejected move',
      });
      const rejectedMove = yield* makeTx(
        'applyAggregateMutationTxSpec.moveTombstone.transaction',
        Db,
      )(function* () {
        const tx = yield* Db.Tx;
        return yield* applyAggregateMutationTx({
          tx,
          mutation: moveMutation,
          commandId: 'cmd_aggregate_move',
          mutationIndex: 0,
          appliedAt: revivedAt,
        }).pipe(Effect.result);
      })().pipe(Effect.provideService(Db, db));
      expect(rejectedMove._tag).toBe('Failure');
      if (rejectedMove._tag === 'Failure') {
        expect(rejectedMove.failure.code).toBe('service-resource-deleted');
      }

      const deleteMutation = yield* makeModelMutations(Product).delete({
        resourceId: productId,
      });
      const rejectedDelete = yield* makeTx(
        'applyAggregateMutationTxSpec.deleteTombstone.transaction',
        Db,
      )(function* () {
        const tx = yield* Db.Tx;
        return yield* applyAggregateMutationTx({
          tx,
          mutation: deleteMutation,
          commandId: 'cmd_aggregate_delete_again',
          mutationIndex: 0,
          appliedAt: revivedAt,
        }).pipe(Effect.result);
      })().pipe(Effect.provideService(Db, db));
      expect(rejectedDelete._tag).toBe('Failure');
      if (rejectedDelete._tag === 'Failure') {
        expect(rejectedDelete.failure.code).toBe('service-resource-deleted');
      }

      const createMutation = yield* makeModelMutations(Product).create({
        resourceId: productId,
        attributes: { name: 'Replacement' },
      });

      const applied = yield* makeTx(
        'applyAggregateMutationTxSpec.create.transaction',
        Db,
      )(function* () {
        const tx = yield* Db.Tx;
        return yield* applyAggregateMutationTx({
          tx,
          mutation: createMutation,
          commandId: 'cmd_aggregate_recreate',
          mutationIndex: 0,
          appliedAt: revivedAt,
        });
      })().pipe(Effect.provideService(Db, db));

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

      const mutation = yield* makeModelMutations(Product).replicate({
        id: productId,
        modelName: Product.modelName,
        createdAt: revivedAt,
        updatedAt: revivedAt,
        version: Product.version,
        name: 'Replacement',
      });
      class Db extends Context.Service<Db, typeof db>()(
        'core/src/contracts/applyAggregateMutationTx.node.spec/Db',
      ) {
        static readonly Tx = Context.Service<
          'core/src/contracts/applyAggregateMutationTx.node.spec/Db.Tx',
          ITx<IDbConfig<IDbConfig['schema'], (typeof db)['_']['relations']>>
        >('core/src/contracts/applyAggregateMutationTx.node.spec/Db.Tx');
      }

      const applied = yield* makeTx(
        'applyAggregateMutationTxSpec.replicate.transaction',
        Db,
      )(function* () {
        const tx = yield* Db.Tx;
        return yield* applyAggregateMutationTx({
          tx,
          mutation,
          commandId: 'cmd_aggregate_replicate',
          mutationIndex: 0,
          appliedAt: revivedAt,
        });
      })().pipe(Effect.provideService(Db, db));

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

      yield* makeTx(
        'applyAggregateMutationTxSpec.inverseReplication.transaction',
        Db,
      )(function* () {
        const tx = yield* Db.Tx;
        return yield* applyMutationInverseTx({ tx, mutation: applied });
      })().pipe(Effect.provideService(Db, db));
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

      const tombstoneReplication = yield* makeTx(
        'applyAggregateMutationTxSpec.replicateDeleted.transaction',
        Db,
      )(function* () {
        const tx = yield* Db.Tx;
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
      })().pipe(Effect.provideService(Db, db));
      expect(tombstoneReplication._tag).toBe('Success');
      expect(db.select().from(dbConfig.schema.product).get()).toMatchObject({
        deletedAt,
        name: 'Replacement',
      });
    }).pipe(Effect.provide(AsyncLive)),
  );
});
