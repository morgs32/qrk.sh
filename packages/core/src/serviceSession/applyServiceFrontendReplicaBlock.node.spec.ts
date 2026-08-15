import { it } from '@effect/vitest';
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
  makePrefixedIncrementalIdFactory('applyServiceFrontendReplicaBlock'),
  ErrorLayer,
  TestContext,
);

const now = new Date('2026-01-01T00:00:00.000Z');

describe('applyServiceFrontendReplicaBlock', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'proves duplicates and rejects incoherent target, lock, and index envelopes before mutation',
      () =>
        Effect.gen(function* () {
          const dbConfig = makeResourceDbConfig({ models });
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

          yield* applyServiceFrontendReplicaState({
            frontend,
            userId: 'user_viewer',
            systemId: 'sys_shop',
            serviceFrontendLockKey: 'service-lock-key',
            db,
            models,
            frontendReplicaState: {
              userId: 'user_viewer',
              systemId: 'sys_shop',
              systemVersion: '1.0.0',
              serviceName: 'catalog',
              frontendName: 'catalog',
              serviceFrontendLockKey: 'service-lock-key',
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
            serviceName: 'catalog',
            userId: 'user_viewer',
            frontendName: 'catalog',
            serviceFrontendLockKey: 'service-lock-key',
            replicaIndex: 8,
            frontendIndex: 5,
            frontendBlock: {
              serviceName: 'catalog',
              userId: 'user_viewer',
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
          };

          const applied = yield* applyServiceFrontendReplicaBlock({
            frontend,
            userId: 'user_viewer',
            systemId: 'sys_shop',
            serviceFrontendLockKey: 'service-lock-key',
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
            userId: 'user_viewer',
            systemId: 'sys_shop',
            serviceFrontendLockKey: 'service-lock-key',
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
            userId: 'user_viewer',
            systemId: 'sys_shop',
            serviceFrontendLockKey: 'service-lock-key',
            currentFrontendIndex: 5,
            currentReplicaIndex: 8,
            previousReplicaBlock: firstBlock,
            db,
            models,
            frontendReplicaBlock: {
              systemId: 'sys_shop',
              serviceName: 'catalog',
              userId: 'user_viewer',
              frontendName: 'catalog',
              serviceFrontendLockKey: 'service-lock-key',
              replicaIndex: 8,
              frontendIndex: 5,
              frontendBlock: {
                serviceName: 'catalog',
                userId: 'user_viewer',
                frontendName: 'catalog',
                frontendIndex: 5,
                lastServiceCursor: 'svcur_5',
                delta: { inserted: [], updated: [], deleted: [] },
              },
            },
          }).pipe(Effect.either);
          expect(conflictingDuplicate._tag).toBe('Left');

          const incoherentEnvelope = yield* applyServiceFrontendReplicaBlock({
            frontend,
            userId: 'user_viewer',
            systemId: 'sys_shop',
            serviceFrontendLockKey: 'service-lock-key',
            currentFrontendIndex: 5,
            currentReplicaIndex: 8,
            previousReplicaBlock: firstBlock,
            db,
            models,
            frontendReplicaBlock: {
              systemId: 'sys_shop',
              serviceName: 'catalog',
              userId: 'user_viewer',
              frontendName: 'catalog',
              serviceFrontendLockKey: 'service-lock-key',
              replicaIndex: 9,
              frontendIndex: 7,
              frontendBlock: {
                serviceName: 'catalog',
                userId: 'user_viewer',
                frontendName: 'catalog',
                frontendIndex: 6,
                lastServiceCursor: 'svcur_6',
                delta: { inserted: [], updated: [], deleted: [] },
              },
            },
          }).pipe(Effect.either);
          expect(incoherentEnvelope._tag).toBe('Left');

          const wrongLockKey = yield* applyServiceFrontendReplicaBlock({
            frontend,
            userId: 'user_viewer',
            systemId: 'sys_shop',
            serviceFrontendLockKey: 'service-lock-key',
            currentFrontendIndex: 5,
            currentReplicaIndex: 8,
            previousReplicaBlock: firstBlock,
            db,
            models,
            frontendReplicaBlock: {
              systemId: 'sys_shop',
              serviceName: 'catalog',
              userId: 'user_viewer',
              frontendName: 'catalog',
              serviceFrontendLockKey: 'other-service-lock-key',
              replicaIndex: 9,
              frontendIndex: 6,
              frontendBlock: {
                serviceName: 'catalog',
                userId: 'user_viewer',
                frontendName: 'catalog',
                frontendIndex: 6,
                lastServiceCursor: 'svcur_6',
                delta: { inserted: [], updated: [], deleted: [] },
              },
            },
          }).pipe(Effect.either);
          expect(wrongLockKey._tag).toBe('Left');
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
