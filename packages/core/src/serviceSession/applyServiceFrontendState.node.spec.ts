import { it } from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemoryWasmSqliteDb } from '../drizzle/makeMigratedInMemoryWasmSqliteDb.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';
import { makeServiceFrontendController } from '../serviceFrontendController/makeServiceFrontendController.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { applyServiceFrontendState } from './applyServiceFrontendState.ts';

const Category = makeServiceModel(
  {
    serviceName: 'catalog',
    abbreviation: 'cat',
    modelName: 'category',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const Product = makeServiceModel(
  {
    serviceName: 'catalog',
    abbreviation: 'prd',
    modelName: 'product',
    attributes: {
      categoryId: primitives.ref({
        table: Category.table,
        relation: 'category',
        inverse: 'products',
      }),
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const models = {
  category: Category,
  product: Product,
};

const frontend = makeServiceFrontendController({
  systemName: 'shop',
  serviceName: 'catalog',
  actorName: 'viewer',
  frontendName: 'catalog',
  version: '1.0.0',
  models,
  signature: Schema.Struct({ subject: Schema.String }),
});

const TestLayer = Layer.mergeAll(
  AsyncLive,
  makePrefixedIncrementalIdFactory('applyServiceFrontendState'),
  ErrorLayer,
  TestContext,
);

const now = new Date('2026-01-01T00:00:00.000Z');

describe('applyServiceFrontendState', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'validates the complete target and rolls a failed replacement back on the same database',
      () =>
        Effect.gen(function* () {
          // 1 — create the one database object that every replacement must keep.
          const dbConfig = makeResourceDbConfig({ models });
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

          // 2 — install a valid baseline snapshot.
          yield* applyServiceFrontendState({
            frontend,
            actorId: 'actr_viewer',
            systemId: 'sys_shop',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'shop-worker-1',
            db,
            models,
            frontendState: {
              actorId: 'actr_viewer',
              systemId: 'sys_shop',
              generationId: 'gen_1',
              systemVersion: '1.0.0',
              systemWorkerName: 'shop-worker-1',
              serviceName: 'catalog',
              actorName: 'viewer',
              frontendName: 'catalog',
              frontendIndex: 4,
              resources: [
                {
                  id: 'cat_original',
                  modelName: 'category',
                  version: '1.0.0',
                  createdAt: now,
                  updatedAt: now,
                  deletedAt: null,
                  name: 'Original category',
                },
                {
                  id: 'prd_original',
                  modelName: 'product',
                  version: '1.0.0',
                  createdAt: now,
                  updatedAt: now,
                  deletedAt: null,
                  categoryId: 'cat_original',
                  name: 'Original product',
                },
              ],
            },
          });

          // 3 — reject a validly encoded state for another actor before deletion.
          const wrongTarget = yield* applyServiceFrontendState({
            frontend,
            actorId: 'actr_viewer',
            systemId: 'sys_shop',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'shop-worker-1',
            db,
            models,
            frontendState: {
              actorId: 'actr_other',
              systemId: 'sys_shop',
              generationId: 'gen_1',
              systemVersion: '1.0.0',
              systemWorkerName: 'shop-worker-1',
              serviceName: 'catalog',
              actorName: 'viewer',
              frontendName: 'catalog',
              frontendIndex: 5,
              resources: [],
            },
          }).pipe(Effect.either);
          expect(wrongTarget._tag).toBe('Left');
          expect(
            db.select().from(models.product.drizzleSchema).all(),
          ).toHaveLength(1);

          // 4 — force a deferred foreign-key failure after replacement starts.
          const failedReplacement = yield* applyServiceFrontendState({
            frontend,
            actorId: 'actr_viewer',
            systemId: 'sys_shop',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'shop-worker-1',
            db,
            models,
            frontendState: {
              actorId: 'actr_viewer',
              systemId: 'sys_shop',
              generationId: 'gen_1',
              systemVersion: '1.0.0',
              systemWorkerName: 'shop-worker-1',
              serviceName: 'catalog',
              actorName: 'viewer',
              frontendName: 'catalog',
              frontendIndex: 5,
              resources: [
                {
                  id: 'cat_would_replace',
                  modelName: 'category',
                  version: '1.0.0',
                  createdAt: now,
                  updatedAt: now,
                  deletedAt: null,
                  name: 'Would replace',
                },
                {
                  id: 'prd_invalid_reference',
                  modelName: 'product',
                  version: '1.0.0',
                  createdAt: now,
                  updatedAt: now,
                  deletedAt: null,
                  categoryId: 'cat_missing',
                  name: 'Invalid product',
                },
              ],
            },
          }).pipe(Effect.either);
          expect(failedReplacement._tag).toBe('Left');
          expect(
            db.select().from(models.category.drizzleSchema).all(),
          ).toEqual([
            expect.objectContaining({
              id: 'cat_original',
              name: 'Original category',
            }),
          ]);
          expect(
            db.select().from(models.product.drizzleSchema).all(),
          ).toEqual([
            expect.objectContaining({
              id: 'prd_original',
              categoryId: 'cat_original',
              name: 'Original product',
            }),
          ]);

          // 5 — a later valid snapshot replaces both tables on that same db.
          yield* applyServiceFrontendState({
            frontend,
            actorId: 'actr_viewer',
            systemId: 'sys_shop',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'shop-worker-1',
            db,
            models,
            frontendState: {
              actorId: 'actr_viewer',
              systemId: 'sys_shop',
              generationId: 'gen_1',
              systemVersion: '1.0.0',
              systemWorkerName: 'shop-worker-1',
              serviceName: 'catalog',
              actorName: 'viewer',
              frontendName: 'catalog',
              frontendIndex: 5,
              resources: [
                {
                  id: 'cat_replacement',
                  modelName: 'category',
                  version: '1.0.0',
                  createdAt: now,
                  updatedAt: now,
                  deletedAt: null,
                  name: 'Replacement category',
                },
                {
                  id: 'prd_replacement',
                  modelName: 'product',
                  version: '1.0.0',
                  createdAt: now,
                  updatedAt: now,
                  deletedAt: null,
                  categoryId: 'cat_replacement',
                  name: 'Replacement product',
                },
              ],
            },
          });
          expect(
            db
              .select()
              .from(models.product.drizzleSchema)
              .all()
              .map(row => row.id),
          ).toEqual(['prd_replacement']);
        }),
    );
  });
});
