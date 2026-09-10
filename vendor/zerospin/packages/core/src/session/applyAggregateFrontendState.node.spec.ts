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
      'replaces resources and durably preserves independent frontend and aggregate cursors',
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
            frontendState: {
              aggregateId: 'acct_1',
              userId: 'user_1',
              systemId: 'sys_1',
              aggregateName: main.aggregateName,
              frontendName: main.name,
              aggregateIndex: 3,
              userIndex: 8,
              aggregateVersion: '1.0.0',
              resolutions: [],
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
            userIndex: 8,
            pushIndex: 0,
          });
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
            frontendState: {
              aggregateId: 'acct_1',
              userId: 'user_1',
              systemId: 'sys_1',
              aggregateName: main.aggregateName,
              frontendName: main.name,
              aggregateIndex: 4,
              userIndex: 10,
              aggregateVersion: '1.0.0',
              resolutions: [],
              resources: [],
            },
          });

          expect(
            db.select().from(sessionMetadataDrizzleSchema).get(),
          ).toMatchObject({ nextSessionIndex: 9 });
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
            frontendState: {
              aggregateId: 'acct_1',
              userId: 'user_1',
              systemId: 'sys_1',
              aggregateName: main.aggregateName,
              frontendName: main.name,
              aggregateIndex: 0,
              userIndex: 0,
              aggregateVersion: '1.0.0',
              resolutions: [0, 1].map(() => ({
                sourceCommand: '{}',
                command: {
                  id: 'cmd_1',
                  commandName: 'createList',
                  payload: '{}',
                  contractVersion: '1.0.0',
                  aggregateId: 'acct_1',
                  aggregateName: main.aggregateName,
                  systemName: main.systemName,
                  userId: 'user_1',
                  frontendName: main.name,
                  sessionId: 'sesn_state',
                  pushIndex: null,
                  aggregateIndex: 1,
                  chainedAt: now,
                  delta: null,
                  failedAt: null,
                  failure: null,
                  dispositionHash: 'a'.repeat(64),
                },
                mutations: [],
                preparationVersion: '1.0.0',
                executionTimestamp: now,
              })),
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
          frontendState: {
            aggregateId: 'acct_1',
            userId: 'user_1',
            systemId: 'sys_1',
            aggregateName: main.aggregateName,
            frontendName: main.name,
            aggregateIndex: 0,
            userIndex: 0,
            aggregateVersion: '1.0.0',
            resolutions: [],
            resources,
          },
        });

        expect(db.select().from(List.drizzleSchema).all()).toHaveLength(105);
      }),
    );
  });
});
