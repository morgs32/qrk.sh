import { it } from '@effect/vitest';
import { eq } from 'drizzle-orm';
import { Effect, Layer, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemoryWasmSqliteDb } from '../drizzle/makeMigratedInMemoryWasmSqliteDb.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { applyServiceFrontendBlock } from './applyServiceFrontendBlock.ts';
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

const frontend = makeFrontendController({
  systemName: 'shop',
  serviceName: 'catalog',
  frontendName: 'catalog',
  userId: Schema.NonEmptyString,
  models,
  signature: Schema.Struct({ subject: Schema.String }),
});

const TestLayer = Layer.mergeAll(
  AsyncLive,
  makePrefixedIncrementalIdFactory('applyServiceFrontendBlock'),
  ErrorLayer,
  TestContext,
);

const now = new Date('2026-01-01T00:00:00.000Z');

describe('applyServiceFrontendBlock', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'accepts atomic FK reordering, enforces identity, and rolls a failed delta back',
      () =>
        Effect.gen(function* () {
          // 1 — seed the exact database object the live blocks will mutate.
          const dbConfig = makeResourceDbConfig({ models });
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
          yield* applyServiceFrontendState({
            frontend,
            userId: 'user_viewer',
            systemId: 'sys_shop',
            db,
            models,
            frontendState: {
              userId: 'user_viewer',
              systemId: 'sys_shop',
              systemVersion: '1.0.0',
              serviceName: 'catalog',
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

          // 2 — commit the exact-next block with its child before its parent.
          yield* applyServiceFrontendBlock({
            frontend,
            userId: 'user_viewer',
            currentFrontendIndex: 4,
            db,
            models,
            frontendBlock: {
              serviceName: 'catalog',
              userId: 'user_viewer',
              frontendName: 'catalog',
              frontendIndex: 5,
              lastServiceCursor: 'svcur_5',
              delta: {
                inserted: [
                  {
                    id: 'prd_inserted',
                    modelName: 'product',
                    version: '1.0.0',
                    createdAt: now,
                    updatedAt: now,
                    deletedAt: null,
                    categoryId: 'cat_inserted',
                    name: 'Inserted product',
                  },
                  {
                    id: 'cat_inserted',
                    modelName: 'category',
                    version: '1.0.0',
                    createdAt: now,
                    updatedAt: now,
                    deletedAt: null,
                    name: 'Inserted category',
                  },
                ],
                updated: [
                  {
                    id: 'cat_original',
                    modelName: 'category',
                    version: '1.0.0',
                    createdAt: now,
                    updatedAt: now,
                    deletedAt: null,
                    name: 'Updated category',
                  },
                ],
                deleted: [],
              },
            },
          });
          expect(
            db
              .select()
              .from(models.category.drizzleSchema)
              .all()
              .map(row => row.id),
          ).toEqual(['cat_original', 'cat_inserted']);
          expect(
            db
              .select()
              .from(models.category.drizzleSchema)
              .where(eq(models.category.drizzleSchema.id, 'cat_original'))
              .get(),
          ).toEqual(
            expect.objectContaining({
              id: 'cat_original',
              name: 'Updated category',
            }),
          );
          expect(
            db
              .select()
              .from(models.product.drizzleSchema)
              .all()
              .map(row => row.id),
          ).toEqual(['prd_original', 'prd_inserted']);

          // 3 — reject a valid block for another actor and an index gap.
          const wrongTarget = yield* applyServiceFrontendBlock({
            frontend,
            userId: 'user_viewer',
            currentFrontendIndex: 5,
            db,
            models,
            frontendBlock: {
              serviceName: 'catalog',
              userId: 'user_other',
              frontendName: 'catalog',
              frontendIndex: 6,
              lastServiceCursor: 'svcur_6',
              delta: { inserted: [], updated: [], deleted: [] },
            },
          }).pipe(Effect.either);
          expect(wrongTarget._tag).toBe('Left');

          const gap = yield* applyServiceFrontendBlock({
            frontend,
            userId: 'user_viewer',
            currentFrontendIndex: 5,
            db,
            models,
            frontendBlock: {
              serviceName: 'catalog',
              userId: 'user_viewer',
              frontendName: 'catalog',
              frontendIndex: 7,
              lastServiceCursor: 'svcur_7',
              delta: { inserted: [], updated: [], deleted: [] },
            },
          }).pipe(Effect.either);
          expect(gap._tag).toBe('Left');

          // 4 — fail at commit after one upsert, retaining the prior rows.
          const failedDelta = yield* applyServiceFrontendBlock({
            frontend,
            userId: 'user_viewer',
            currentFrontendIndex: 5,
            db,
            models,
            frontendBlock: {
              serviceName: 'catalog',
              userId: 'user_viewer',
              frontendName: 'catalog',
              frontendIndex: 6,
              lastServiceCursor: 'svcur_6',
              delta: {
                inserted: [
                  {
                    id: 'cat_would_commit',
                    modelName: 'category',
                    version: '1.0.0',
                    createdAt: now,
                    updatedAt: now,
                    deletedAt: null,
                    name: 'Would commit',
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
                updated: [],
                deleted: [],
              },
            },
          }).pipe(Effect.either);
          expect(failedDelta._tag).toBe('Left');
          expect(
            db
              .select()
              .from(models.category.drizzleSchema)
              .all()
              .map(row => row.id),
          ).toEqual(['cat_original', 'cat_inserted']);
          expect(
            db
              .select()
              .from(models.product.drizzleSchema)
              .all()
              .map(row => row.id),
          ).toEqual(['prd_original', 'prd_inserted']);

          // 5 — the same index accepts a parent delete before its child.
          yield* applyServiceFrontendBlock({
            frontend,
            userId: 'user_viewer',
            currentFrontendIndex: 5,
            db,
            models,
            frontendBlock: {
              serviceName: 'catalog',
              userId: 'user_viewer',
              frontendName: 'catalog',
              frontendIndex: 6,
              lastServiceCursor: 'svcur_6',
              delta: {
                inserted: [],
                updated: [],
                deleted: [
                  { id: 'cat_original', modelName: 'category' },
                  { id: 'prd_original', modelName: 'product' },
                ],
              },
            },
          });
          expect(
            db
              .select()
              .from(models.category.drizzleSchema)
              .all()
              .map(row => row.id),
          ).toEqual(['cat_inserted']);
          expect(
            db
              .select()
              .from(models.product.drizzleSchema)
              .all()
              .map(row => row.id),
          ).toEqual(['prd_inserted']);
        }),
    );
  });
});
