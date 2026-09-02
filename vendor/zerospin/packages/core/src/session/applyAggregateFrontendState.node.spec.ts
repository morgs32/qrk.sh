import { it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemoryWasmSqliteDb } from '../drizzle/makeProvisionedInMemoryWasmSqliteDb.ts';
import { List, main, mainModels, User } from '../fixtures/system.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { applyAggregateFrontendState } from './applyAggregateFrontendState.ts';
import {
  sessionMetadataDrizzleSchema,
  sessionRepoTables,
  sessionResolvedPushDrizzleSchema,
} from './sessionRepoTables.ts';

const TestLayer = Layer.mergeAll(
  AsyncLive,
  makePrefixedIncrementalIdFactory('applyAggregateFrontendState'),
  ErrorLayer,
);

const now = new Date('2026-01-01T00:00:00.000Z');

describe('applyAggregateFrontendState', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'replaces resources and durably normalizes frontiers and resolved pushes',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });

          yield* applyAggregateFrontendState({
            frontend: main,
            sessionId: 'sesn_state',
            aggregateId: 'acct_1',
            userId: 'user_1',
            systemId: 'sys_1',
            db,
            models,
            pushedCommands: [],
            frontendState: {
              aggregateId: 'acct_1',
              userId: 'user_1',
              systemId: 'sys_1',
              systemVersion: '1.0.0',
              aggregateName: main.aggregateName,
              frontendName: main.frontendName,
              aggregateIndex: 3,
              frontendIndex: 4,
              pushIndex: 0,
              resolvedPushIndexes: [],
              resources: [
                {
                  id: 'usr_1',
                  modelName: User.modelName,
                  createdAt: now,
                  updatedAt: now,
                  version: User.version,
                  name: 'User',
                },
              ],
            },
          });

          expect(
            db.select().from(sessionMetadataDrizzleSchema).get(),
          ).toMatchObject({
            sessionId: 'sesn_state',
            nextSessionIndex: 1,
            aggregateIndex: 3,
            frontendIndex: 4,
            pushIndex: 0,
          });
          expect(
            db
              .select()
              .from(sessionResolvedPushDrizzleSchema)
              .all()
              .map(row => row.pushIndex),
          ).toEqual([]);
          expect(db.select().from(User.drizzleSchema).all()).toEqual([
            expect.objectContaining({ id: 'usr_1', name: 'User' }),
          ]);

          db.update(sessionMetadataDrizzleSchema)
            .set({ nextSessionIndex: 9 })
            .run();
          yield* applyAggregateFrontendState({
            frontend: main,
            sessionId: 'sesn_state',
            aggregateId: 'acct_1',
            userId: 'user_1',
            systemId: 'sys_1',
            db,
            models,
            pushedCommands: [],
            frontendState: {
              aggregateId: 'acct_1',
              userId: 'user_1',
              systemId: 'sys_1',
              systemVersion: '1.0.0',
              aggregateName: main.aggregateName,
              frontendName: main.frontendName,
              aggregateIndex: 4,
              frontendIndex: 5,
              pushIndex: 0,
              resolvedPushIndexes: [],
              resources: [],
            },
          });

          expect(
            db.select().from(sessionMetadataDrizzleSchema).get(),
          ).toMatchObject({ nextSessionIndex: 9 });
          expect(
            db.select().from(sessionResolvedPushDrizzleSchema).all(),
          ).toEqual([]);
        }),
    );

    it.effect(
      'rejects duplicate resolved membership before replacing rows',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
          const result = yield* applyAggregateFrontendState({
            frontend: main,
            sessionId: 'sesn_duplicate',
            aggregateId: 'acct_1',
            userId: 'user_1',
            systemId: 'sys_1',
            db,
            models,
            pushedCommands: [],
            frontendState: {
              aggregateId: 'acct_1',
              userId: 'user_1',
              systemId: 'sys_1',
              systemVersion: '1.0.0',
              aggregateName: main.aggregateName,
              frontendName: main.frontendName,
              aggregateIndex: 0,
              frontendIndex: 0,
              pushIndex: 2,
              resolvedPushIndexes: [1, 1],
              resources: [],
            },
          }).pipe(Effect.result);

          expect(result._tag).toBe('Failure');
          expect(db.select().from(sessionMetadataDrizzleSchema).all()).toEqual(
            [],
          );
        }),
    );

    it.effect('installs resource arrays larger than one command page', () =>
      Effect.gen(function* () {
        const models = mainModels;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoTables,
        });
        const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
        const resources = [
          {
            id: 'usr_bulk',
            modelName: User.modelName,
            createdAt: now,
            updatedAt: now,
            version: User.version,
            name: 'Bulk user',
          },
          ...Array.from({ length: 105 }, (_, index) => ({
            id: `lst_bulk_${index}`,
            modelName: List.modelName,
            createdAt: now,
            updatedAt: now,
            version: List.version,
            name: `List ${index}`,
            userId: 'usr_bulk',
          })),
        ];

        yield* applyAggregateFrontendState({
          frontend: main,
          sessionId: 'sesn_bulk',
          aggregateId: 'acct_1',
          userId: 'user_1',
          systemId: 'sys_1',
          db,
          models,
          pushedCommands: [],
          frontendState: {
            aggregateId: 'acct_1',
            userId: 'user_1',
            systemId: 'sys_1',
            systemVersion: '1.0.0',
            aggregateName: main.aggregateName,
            frontendName: main.frontendName,
            aggregateIndex: 0,
            frontendIndex: 0,
            pushIndex: 0,
            resolvedPushIndexes: [],
            resources,
          },
        });

        expect(db.select().from(List.drizzleSchema).all()).toHaveLength(105);
      }),
    );
  });
});
