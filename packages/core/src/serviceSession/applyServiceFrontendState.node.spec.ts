import { it } from '@effect/vitest';
import { primitives } from '@zerospin/schema';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemoryWasmSqliteDb } from '../drizzle/makeProvisionedInMemoryWasmSqliteDb.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { models as modelDefinitions } from '../models/index.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { applyServiceFrontendState } from './applyServiceFrontendState.ts';
import { serviceSessionRepoTables } from './serviceSessionRepoTables.ts';

const Category = modelDefinitions.makeVersion(
  modelDefinitions.makeModel({ name: 'category', abbreviation: 'cat' }),
  {
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
);

const Product = modelDefinitions.makeVersion(
  modelDefinitions.makeModel({ name: 'product', abbreviation: 'prd' }),
  {
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
);

const models = {
  category: Category,
  product: Product,
};

const frontend = makeFrontendController({
  systemName: 'shop',
  serviceVersion: '1.0.0',
  serviceName: 'catalog',
  name: 'catalog',
  models,
});

const TestLayer = Layer.mergeAll(
  AsyncLive,
  makePrefixedIncrementalIdFactory('applyServiceFrontendState'),
  ErrorLayer,
);

const now = new Date('2026-01-01T00:00:00.000Z');

describe('applyServiceFrontendState', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'validates the complete target and rolls a failed replacement back on the same database',
      () =>
        Effect.gen(function* () {
          // 1 — create the one database object that every replacement must keep.
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: serviceSessionRepoTables,
          });
          const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });

          // 2 — install a valid baseline snapshot.
          yield* applyServiceFrontendState({
            frontend,
            userId: 'user_viewer',
            systemId: 'sys_shop',
            sessionId: 'sesn_service',
            db,
            models,
            frontendState: {
              userId: 'user_viewer',
              systemId: 'sys_shop',
              serviceName: 'catalog',
              frontendName: 'catalog',
              serviceIndex: 4,
              serviceVersion: '1.0.0',
              resources: [
                {
                  id: 'cat_original',
                  modelName: 'category',
                  version: '1.0.0',
                  createdAt: now,
                  updatedAt: now,
                  name: 'Original category',
                },
                {
                  id: 'prd_original',
                  modelName: 'product',
                  version: '1.0.0',
                  createdAt: now,
                  updatedAt: now,
                  categoryId: 'cat_original',
                  name: 'Original product',
                },
              ],
            },
          });

          // 3 — reject a validly encoded state for another actor before deletion.
          const wrongTarget = yield* applyServiceFrontendState({
            frontend,
            userId: 'user_viewer',
            systemId: 'sys_shop',
            sessionId: 'sesn_service',
            db,
            models,
            frontendState: {
              userId: 'user_other',
              systemId: 'sys_shop',
              serviceName: 'catalog',
              frontendName: 'catalog',
              serviceIndex: 5,
              serviceVersion: '1.0.0',
              resources: [],
            },
          }).pipe(Effect.result);
          expect(wrongTarget._tag).toBe('Failure');
          expect(
            db.select().from(models.product.drizzleSchema).all(),
          ).toHaveLength(1);

          // 4 — force a deferred foreign-key failure after replacement starts.
          const failedReplacement = yield* applyServiceFrontendState({
            frontend,
            userId: 'user_viewer',
            systemId: 'sys_shop',
            sessionId: 'sesn_service',
            db,
            models,
            frontendState: {
              userId: 'user_viewer',
              systemId: 'sys_shop',
              serviceName: 'catalog',
              frontendName: 'catalog',
              serviceIndex: 5,
              serviceVersion: '1.0.0',
              resources: [
                {
                  id: 'cat_would_replace',
                  modelName: 'category',
                  version: '1.0.0',
                  createdAt: now,
                  updatedAt: now,
                  name: 'Would replace',
                },
                {
                  id: 'prd_invalid_reference',
                  modelName: 'product',
                  version: '1.0.0',
                  createdAt: now,
                  updatedAt: now,
                  categoryId: 'cat_missing',
                  name: 'Invalid product',
                },
              ],
            },
          }).pipe(Effect.result);
          expect(failedReplacement._tag).toBe('Failure');
          expect(db.select().from(models.category.drizzleSchema).all()).toEqual(
            [
              expect.objectContaining({
                id: 'cat_original',
                name: 'Original category',
              }),
            ],
          );
          expect(db.select().from(models.product.drizzleSchema).all()).toEqual([
            expect.objectContaining({
              id: 'prd_original',
              categoryId: 'cat_original',
              name: 'Original product',
            }),
          ]);

          // 5 — a later valid snapshot replaces both tables on that same db.
          yield* applyServiceFrontendState({
            frontend,
            userId: 'user_viewer',
            systemId: 'sys_shop',
            sessionId: 'sesn_service',
            db,
            models,
            frontendState: {
              userId: 'user_viewer',
              systemId: 'sys_shop',
              serviceName: 'catalog',
              frontendName: 'catalog',
              serviceIndex: 5,
              serviceVersion: '1.0.0',
              resources: [
                {
                  id: 'cat_replacement',
                  modelName: 'category',
                  version: '1.0.0',
                  createdAt: now,
                  updatedAt: now,
                  name: 'Replacement category',
                },
                {
                  id: 'prd_replacement',
                  modelName: 'product',
                  version: '1.0.0',
                  createdAt: now,
                  updatedAt: now,
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
