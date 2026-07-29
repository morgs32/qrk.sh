import { it } from '@effect/vitest';
import { sql } from 'drizzle-orm';
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

import { applyServiceFrontendReplicaState } from './applyServiceFrontendReplicaState.ts';

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

const models = {
  category: Category,
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
  makePrefixedIncrementalIdFactory('applyServiceFrontendReplicaState'),
  ErrorLayer,
  TestContext,
);

const now = new Date('2026-01-01T00:00:00.000Z');

describe('applyServiceFrontendReplicaState', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'accepts replica metadata while validating the complete target before replacement',
      () =>
        Effect.gen(function* () {
          const dbConfig = makeResourceDbConfig({ models });
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

          yield* applyServiceFrontendReplicaState({
            frontend,
            actorId: 'actr_viewer',
            systemId: 'sys_shop',
            generationId: 'gen_1',
            systemVersion: '2.0.0',
            systemWorkerName: 'shop-worker-1',
            db,
            models,
            frontendReplicaState: {
              actorId: 'actr_viewer',
              systemId: 'sys_shop',
              generationId: 'gen_1',
              systemVersion: '1.0.0',
              systemWorkerName: 'shop-worker-1',
              serviceName: 'catalog',
              actorName: 'viewer',
              frontendName: 'catalog',
              frontendVersion: '1.0.0',
              frontendIndex: 4,
              replicaIndex: 7,
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
              ],
            },
          });

          expect(db.select().from(models.category.drizzleSchema).all()).toEqual(
            [
              expect.objectContaining({
                id: 'cat_original',
                name: 'Original category',
              }),
            ],
          );

          const wrongFrontendVersion = yield* applyServiceFrontendReplicaState({
            frontend,
            actorId: 'actr_viewer',
            systemId: 'sys_shop',
            generationId: 'gen_1',
            systemVersion: '2.0.0',
            systemWorkerName: 'shop-worker-1',
            db,
            models,
            frontendReplicaState: {
              actorId: 'actr_viewer',
              systemId: 'sys_shop',
              generationId: 'gen_1',
              systemVersion: '1.0.0',
              systemWorkerName: 'shop-worker-1',
              serviceName: 'catalog',
              actorName: 'viewer',
              frontendName: 'catalog',
              frontendVersion: '2.0.0',
              frontendIndex: 5,
              replicaIndex: 8,
              resources: [],
            },
          }).pipe(Effect.either);

          expect(wrongFrontendVersion._tag).toBe('Left');
          expect(db.select().from(models.category.drizzleSchema).all()).toEqual(
            [
              expect.objectContaining({
                id: 'cat_original',
                name: 'Original category',
              }),
            ],
          );
        }),
    );

    it.effect(
      'rolls back a failure after replacement has deleted and inserted service rows',
      () =>
        Effect.gen(function* () {
          const dbConfig = makeResourceDbConfig({ models });
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
          const priorFrontendIndex = 11;
          const priorReplicaIndex = 17;

          yield* applyServiceFrontendReplicaState({
            frontend,
            actorId: 'actr_viewer',
            systemId: 'sys_shop',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'shop-worker-1',
            db,
            models,
            frontendReplicaState: {
              actorId: 'actr_viewer',
              systemId: 'sys_shop',
              generationId: 'gen_1',
              systemVersion: '1.0.0',
              systemWorkerName: 'shop-worker-1',
              serviceName: 'catalog',
              actorName: 'viewer',
              frontendName: 'catalog',
              frontendVersion: '1.0.0',
              frontendIndex: priorFrontendIndex,
              replicaIndex: priorReplicaIndex,
              resources: [
                {
                  id: 'cat_prior_replacement',
                  modelName: 'category',
                  version: '1.0.0',
                  createdAt: now,
                  updatedAt: now,
                  deletedAt: null,
                  name: 'Prior category',
                },
              ],
            },
          });

          db.run(
            sql.raw(`
              CREATE TRIGGER reject_injected_service_replacement
              BEFORE INSERT ON "category"
              WHEN NEW.id = 'cat_injected_replacement_failure'
              BEGIN
                SELECT RAISE(ABORT, 'injected service replacement failure');
              END;
            `),
          );

          const replacement = yield* applyServiceFrontendReplicaState({
            frontend,
            actorId: 'actr_viewer',
            systemId: 'sys_shop',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'shop-worker-1',
            db,
            models,
            frontendReplicaState: {
              actorId: 'actr_viewer',
              systemId: 'sys_shop',
              generationId: 'gen_1',
              systemVersion: '1.0.0',
              systemWorkerName: 'shop-worker-1',
              serviceName: 'catalog',
              actorName: 'viewer',
              frontendName: 'catalog',
              frontendVersion: '1.0.0',
              frontendIndex: 12,
              replicaIndex: 18,
              resources: [
                {
                  id: 'cat_inserted_before_failure',
                  modelName: 'category',
                  version: '1.0.0',
                  createdAt: now,
                  updatedAt: now,
                  deletedAt: null,
                  name: 'Inserted before failure',
                },
                {
                  id: 'cat_injected_replacement_failure',
                  modelName: 'category',
                  version: '1.0.0',
                  createdAt: now,
                  updatedAt: now,
                  deletedAt: null,
                  name: 'Injected failure',
                },
              ],
            },
          }).pipe(Effect.either);

          expect(replacement._tag).toBe('Left');
          expect(db.select().from(models.category.drizzleSchema).all()).toEqual(
            [
              expect.objectContaining({
                id: 'cat_prior_replacement',
                name: 'Prior category',
              }),
            ],
          );
          expect(priorFrontendIndex).toBe(11);
          expect(priorReplicaIndex).toBe(17);
        }),
    );
  });
});
