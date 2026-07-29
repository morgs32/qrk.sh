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

import { applyServiceFrontendReplicaBlock } from './applyServiceFrontendReplicaBlock.ts';
import { applyServiceFrontendReplicaState } from './applyServiceFrontendReplicaState.ts';
import type { IServiceFrontendReplicaBlock } from './types.ts';

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
  makePrefixedIncrementalIdFactory('applyServiceFrontendReplicaBlock'),
  ErrorLayer,
  TestContext,
);

const now = new Date('2026-01-01T00:00:00.000Z');

describe('applyServiceFrontendReplicaBlock', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'proves duplicates and rejects incoherent lineage before mutation',
      () =>
        Effect.gen(function* () {
          const dbConfig = makeResourceDbConfig({ models });
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

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

          const firstBlock: IServiceFrontendReplicaBlock = {
            systemId: 'sys_shop',
            generationId: 'gen_1',
            serviceName: 'catalog',
            actorId: 'actr_viewer',
            actorName: 'viewer',
            frontendName: 'catalog',
            frontendVersion: '1.0.0',
            replicaIndex: 8,
            frontendIndex: 5,
            lineageBlock: {
              kind: 'service-frontend',
              systemId: 'sys_shop',
              generationId: 'gen_1',
              serviceName: 'catalog',
              actorId: 'actr_viewer',
              actorName: 'viewer',
              frontendName: 'catalog',
              frontendBlock: {
                serviceName: 'catalog',
                actorName: 'viewer',
                actorId: 'actr_viewer',
                frontendName: 'catalog',
                frontendIndex: 5,
                lastServiceCursor: 'svcur_5',
                delta: {
                  inserted: [],
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
            },
          };

          const applied = yield* applyServiceFrontendReplicaBlock({
            frontend,
            actorId: 'actr_viewer',
            systemId: 'sys_shop',
            generationId: 'gen_1',
            currentFrontendIndex: 4,
            currentReplicaIndex: 7,
            previousReplicaBlock: null,
            db,
            models,
            frontendReplicaBlock: firstBlock,
          });
          expect(applied).toBe('applied');
          expect(db.select().from(models.category.drizzleSchema).all()).toEqual(
            [
              expect.objectContaining({
                id: 'cat_original',
                name: 'Updated category',
              }),
            ],
          );

          const duplicate = yield* applyServiceFrontendReplicaBlock({
            frontend,
            actorId: 'actr_viewer',
            systemId: 'sys_shop',
            generationId: 'gen_1',
            currentFrontendIndex: 5,
            currentReplicaIndex: 8,
            previousReplicaBlock: firstBlock,
            db,
            models,
            frontendReplicaBlock: firstBlock,
          });
          expect(duplicate).toBe('duplicate');

          const conflictingDuplicate = yield* applyServiceFrontendReplicaBlock({
            frontend,
            actorId: 'actr_viewer',
            systemId: 'sys_shop',
            generationId: 'gen_1',
            currentFrontendIndex: 5,
            currentReplicaIndex: 8,
            previousReplicaBlock: firstBlock,
            db,
            models,
            frontendReplicaBlock: {
              systemId: 'sys_shop',
              generationId: 'gen_1',
              serviceName: 'catalog',
              actorId: 'actr_viewer',
              actorName: 'viewer',
              frontendName: 'catalog',
              frontendVersion: '1.0.0',
              replicaIndex: 8,
              frontendIndex: 5,
              lineageBlock: {
                kind: 'service-frontend',
                systemId: 'sys_shop',
                generationId: 'gen_1',
                serviceName: 'catalog',
                actorId: 'actr_viewer',
                actorName: 'viewer',
                frontendName: 'catalog',
                frontendBlock: {
                  serviceName: 'catalog',
                  actorName: 'viewer',
                  actorId: 'actr_viewer',
                  frontendName: 'catalog',
                  frontendIndex: 5,
                  lastServiceCursor: 'svcur_5',
                  delta: { inserted: [], updated: [], deleted: [] },
                },
              },
            },
          }).pipe(Effect.either);
          expect(conflictingDuplicate._tag).toBe('Left');

          const incoherentEnvelope = yield* applyServiceFrontendReplicaBlock({
            frontend,
            actorId: 'actr_viewer',
            systemId: 'sys_shop',
            generationId: 'gen_1',
            currentFrontendIndex: 5,
            currentReplicaIndex: 8,
            previousReplicaBlock: firstBlock,
            db,
            models,
            frontendReplicaBlock: {
              systemId: 'sys_shop',
              generationId: 'gen_1',
              serviceName: 'catalog',
              actorId: 'actr_viewer',
              actorName: 'viewer',
              frontendName: 'catalog',
              frontendVersion: '1.0.0',
              replicaIndex: 9,
              frontendIndex: 7,
              lineageBlock: {
                kind: 'service-frontend',
                systemId: 'sys_shop',
                generationId: 'gen_1',
                serviceName: 'catalog',
                actorId: 'actr_viewer',
                actorName: 'viewer',
                frontendName: 'catalog',
                frontendBlock: {
                  serviceName: 'catalog',
                  actorName: 'viewer',
                  actorId: 'actr_viewer',
                  frontendName: 'catalog',
                  frontendIndex: 6,
                  lastServiceCursor: 'svcur_6',
                  delta: { inserted: [], updated: [], deleted: [] },
                },
              },
            },
          }).pipe(Effect.either);
          expect(incoherentEnvelope._tag).toBe('Left');

          const wrongGeneration = yield* applyServiceFrontendReplicaBlock({
            frontend,
            actorId: 'actr_viewer',
            systemId: 'sys_shop',
            generationId: 'gen_1',
            currentFrontendIndex: 5,
            currentReplicaIndex: 8,
            previousReplicaBlock: firstBlock,
            db,
            models,
            frontendReplicaBlock: {
              systemId: 'sys_shop',
              generationId: 'gen_1',
              serviceName: 'catalog',
              actorId: 'actr_viewer',
              actorName: 'viewer',
              frontendName: 'catalog',
              frontendVersion: '1.0.0',
              replicaIndex: 9,
              frontendIndex: 6,
              lineageBlock: {
                kind: 'service-frontend',
                systemId: 'sys_shop',
                generationId: 'gen_other',
                serviceName: 'catalog',
                actorId: 'actr_viewer',
                actorName: 'viewer',
                frontendName: 'catalog',
                frontendBlock: {
                  serviceName: 'catalog',
                  actorName: 'viewer',
                  actorId: 'actr_viewer',
                  frontendName: 'catalog',
                  frontendIndex: 6,
                  lastServiceCursor: 'svcur_6',
                  delta: { inserted: [], updated: [], deleted: [] },
                },
              },
            },
          }).pipe(Effect.either);
          expect(wrongGeneration._tag).toBe('Left');

          const wrongPredecessor = yield* applyServiceFrontendReplicaBlock({
            frontend,
            actorId: 'actr_viewer',
            systemId: 'sys_shop',
            generationId: 'gen_1',
            currentFrontendIndex: 5,
            currentReplicaIndex: 8,
            previousReplicaBlock: firstBlock,
            db,
            models,
            frontendReplicaBlock: {
              systemId: 'sys_shop',
              generationId: 'gen_1',
              serviceName: 'catalog',
              actorId: 'actr_viewer',
              actorName: 'viewer',
              frontendName: 'catalog',
              frontendVersion: '1.0.0',
              replicaIndex: 9,
              frontendIndex: 6,
              lineageBlock: {
                kind: 'generation-boundary',
                systemId: 'sys_shop',
                prevGenerationId: 'gen_other',
                generationId: 'gen_2',
                serviceName: 'catalog',
                actorId: 'actr_viewer',
                actorName: 'viewer',
                frontendName: 'catalog',
                frontendIndex: 6,
              },
            },
          }).pipe(Effect.either);
          expect(wrongPredecessor._tag).toBe('Left');

          const boundary: IServiceFrontendReplicaBlock = {
            systemId: 'sys_shop',
            generationId: 'gen_1',
            serviceName: 'catalog',
            actorId: 'actr_viewer',
            actorName: 'viewer',
            frontendName: 'catalog',
            frontendVersion: '1.0.0',
            replicaIndex: 9,
            frontendIndex: 6,
            lineageBlock: {
              kind: 'generation-boundary',
              systemId: 'sys_shop',
              prevGenerationId: 'gen_1',
              generationId: 'gen_2',
              serviceName: 'catalog',
              actorId: 'actr_viewer',
              actorName: 'viewer',
              frontendName: 'catalog',
              frontendIndex: 6,
            },
          };
          const appliedBoundary = yield* applyServiceFrontendReplicaBlock({
            frontend,
            actorId: 'actr_viewer',
            systemId: 'sys_shop',
            generationId: 'gen_1',
            currentFrontendIndex: 5,
            currentReplicaIndex: 8,
            previousReplicaBlock: firstBlock,
            db,
            models,
            frontendReplicaBlock: boundary,
          });
          expect(appliedBoundary).toBe('applied');
          expect(db.select().from(models.category.drizzleSchema).all()).toEqual(
            [
              expect.objectContaining({
                id: 'cat_original',
                name: 'Updated category',
              }),
            ],
          );
        }),
    );
  });
});
