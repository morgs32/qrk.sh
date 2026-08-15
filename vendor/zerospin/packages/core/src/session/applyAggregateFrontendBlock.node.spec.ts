import { it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemoryWasmSqliteDb } from '../drizzle/makeMigratedInMemoryWasmSqliteDb.ts';
import { List, main, mainModels, User } from '../fixtures/system.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { applyAggregateFrontendBlock } from './applyAggregateFrontendBlock.ts';
import { applyAggregateFrontendReplicaState } from './applyAggregateFrontendReplicaState.ts';
import { sessionRepoTables } from './sessionRepoTables.ts';

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('applyAggregateFrontendBlock'),
  ErrorLayer,
  TestContext,
  AsyncLive,
);

const now = new Date('2026-01-01T00:00:00.000Z');

describe('applyAggregateFrontendBlock', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'applies an ordinary server block and rejects target or index mismatch',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

          yield* applyAggregateFrontendReplicaState({
            frontend: main,
            aggregateId: 'acct_1',
            userId: 'user_1',
            systemId: 'sys_1',
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema: dbConfig.schema,
            models,
            frontendReplicaState: {
              aggregateId: 'acct_1',
              aggregateName: main.aggregateName,
              userId: 'user_1',
              systemId: 'sys_1',
              systemVersion: '1.0.0',
              frontendName: main.frontendName,
              aggregateFrontendLockKey: 'aggregate-lock-key',
              frontendIndex: 0,
              replicaIndex: 0,
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
              pushedCommands: [],
              stagedCommands: [],
              failedStagedCommands: [],
              executedPushedCommands: [],
              failedPushedCommands: [],
              optimisticAppliedMutations: [],
            },
          });

          yield* applyAggregateFrontendBlock({
            db,
            frontend: main,
            models,
            aggregateId: 'acct_1',
            userId: 'user_1',
            currentFrontendIndex: 0,
            frontendBlock: {
              frontendName: main.frontendName,
              lastAggregateCursor: 'acur_direct_1',
              frontendIndex: 1,
              delta: {
                inserted: [
                  {
                    id: 'lst_direct_1',
                    modelName: List.modelName,
                    createdAt: now,
                    updatedAt: now,
                    version: List.version,
                    name: 'Direct',
                    userId: 'usr_1',
                  },
                ],
                updated: [],
                deleted: [],
              },
              pendingPushedCommands: [],
              executedPushedCommands: [],
              failedPushedCommands: [],
            },
          });

          expect(
            db.select().from(models.list.drizzleSchema).all(),
          ).toHaveLength(1);

          const badCommandTarget = yield* applyAggregateFrontendBlock({
            db,
            frontend: main,
            models,
            aggregateId: 'acct_1',
            userId: 'user_1',
            currentFrontendIndex: 1,
            frontendBlock: {
              frontendName: main.frontendName,
              lastAggregateCursor: 'acur_direct_bad_target',
              frontendIndex: 2,
              delta: { inserted: [], updated: [], deleted: [] },
              pendingPushedCommands: [
                {
                  id: 'cmd_direct_bad_target',
                  commandName: 'createList',
                  payload: '{}',
                  contractVersion: main.contracts.createList.version,
                  commandType: 'frontend',
                  systemName: main.systemName,
                  aggregateId: 'acct_wrong',
                  aggregateName: main.aggregateName,
                  userId: 'user_1',
                  frontendName: main.frontendName,
                  sessionId: 'sesn_direct_bad_target',
                  stagedCursor: 'stcur_direct_bad_target',
                  stagedAt: now,
                  replicaIndex: 1,
                  pushedAt: now,
                  pushedCursor: 'pcur_direct_bad_target',
                  status: 'pushed',
                },
              ],
              executedPushedCommands: [],
              failedPushedCommands: [],
            },
          }).pipe(Effect.either);
          expect(badCommandTarget._tag).toBe('Left');
          if (badCommandTarget._tag === 'Left') {
            expect(badCommandTarget.left.code).toBe(
              'aggregate-frontend-block-pending-command-target-mismatch',
            );
          }

          const indexMismatch = yield* applyAggregateFrontendBlock({
            db,
            frontend: main,
            models,
            aggregateId: 'acct_1',
            userId: 'user_1',
            currentFrontendIndex: 1,
            frontendBlock: {
              frontendName: main.frontendName,
              lastAggregateCursor: 'acur_direct_gap',
              frontendIndex: 3,
              delta: { inserted: [], updated: [], deleted: [] },
              pendingPushedCommands: [],
              executedPushedCommands: [],
              failedPushedCommands: [],
            },
          }).pipe(Effect.either);

          expect(indexMismatch._tag).toBe('Left');
        }),
    );
  });
});
