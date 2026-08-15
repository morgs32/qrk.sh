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

import { applyAggregateFrontendReplicaBlock } from './applyAggregateFrontendReplicaBlock.ts';
import { applyAggregateFrontendReplicaState } from './applyAggregateFrontendReplicaState.ts';
import { sessionRepoTables } from './sessionRepoTables.ts';
import type { IAggregateFrontendReplicaBlock } from './types.ts';

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('applyAggregateFrontendReplicaBlock'),
  ErrorLayer,
  TestContext,
  AsyncLive,
);

const now = new Date('2026-01-01T00:00:00.000Z');

describe('applyAggregateFrontendReplicaBlock', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'enforces target, lock, and contiguous indices, proves duplicates, and rolls back failures',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

          yield* applyAggregateFrontendReplicaState({
            frontend: main,
            aggregateId: 'acct_1',
            userId: 'user_1',
            systemId: 'sys_1',
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema,
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

          const localBlock: IAggregateFrontendReplicaBlock = {
            kind: 'local-command',
            systemId: 'sys_1',
            aggregateId: 'acct_1',
            aggregateName: main.aggregateName,
            userId: 'user_1',
            frontendName: main.frontendName,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            replicaIndex: 1,
            frontendIndex: 0,
            delta: {
              inserted: [
                {
                  id: 'lst_1',
                  modelName: List.modelName,
                  createdAt: now,
                  updatedAt: now,
                  version: List.version,
                  name: 'Local',
                  userId: 'usr_local_parent',
                },
                {
                  id: 'usr_local_parent',
                  modelName: User.modelName,
                  createdAt: now,
                  updatedAt: now,
                  version: User.version,
                  name: 'Local parent',
                },
              ],
              updated: [],
              deleted: [],
            },
            stagedCommandsAdded: [],
            stagedCommandIdsRemoved: [],
            pushedCommandsAdded: [],
            pushedCommandIdsRemoved: [],
            executedPushedCommandsAdded: [],
            executedPushedCommandIdsRemoved: [],
            failedStagedCommandsAdded: [],
            failedPushedCommandsAdded: [],
            failedCommandIdsRemoved: [],
            optimisticAppliedMutationsAdded: [],
            optimisticAppliedMutationCommandIdsRemoved: [],
          };

          const applied = yield* applyAggregateFrontendReplicaBlock({
            db,
            frontend: main,
            models,
            frontendReplicaBlock: localBlock,
            aggregateId: 'acct_1',
            userId: 'user_1',
            systemId: 'sys_1',
            aggregateFrontendLockKey: 'aggregate-lock-key',
            currentFrontendIndex: 0,
            currentReplicaIndex: 0,
            previousReplicaBlock: null,
          });
          expect(applied).toBe('applied');
          expect(
            db.select().from(models.list.drizzleSchema).all(),
          ).toHaveLength(1);

          const duplicate = yield* applyAggregateFrontendReplicaBlock({
            db,
            frontend: main,
            models,
            frontendReplicaBlock: localBlock,
            aggregateId: 'acct_1',
            userId: 'user_1',
            systemId: 'sys_1',
            aggregateFrontendLockKey: 'aggregate-lock-key',
            currentFrontendIndex: 0,
            currentReplicaIndex: 1,
            previousReplicaBlock: localBlock,
          });
          expect(duplicate).toBe('duplicate');

          const conflictingDuplicate =
            yield* applyAggregateFrontendReplicaBlock({
              db,
              frontend: main,
              models,
              frontendReplicaBlock: {
                ...localBlock,
                delta: { inserted: [], updated: [], deleted: [] },
              },
              aggregateId: 'acct_1',
              userId: 'user_1',
              systemId: 'sys_1',
              aggregateFrontendLockKey: 'aggregate-lock-key',
              currentFrontendIndex: 0,
              currentReplicaIndex: 1,
              previousReplicaBlock: localBlock,
            }).pipe(Effect.either);
          expect(conflictingDuplicate._tag).toBe('Left');

          const gap = yield* applyAggregateFrontendReplicaBlock({
            db,
            frontend: main,
            models,
            frontendReplicaBlock: { ...localBlock, replicaIndex: 3 },
            aggregateId: 'acct_1',
            userId: 'user_1',
            systemId: 'sys_1',
            aggregateFrontendLockKey: 'aggregate-lock-key',
            currentFrontendIndex: 0,
            currentReplicaIndex: 1,
            previousReplicaBlock: localBlock,
          }).pipe(Effect.either);
          expect(gap._tag).toBe('Left');

          const badLocalCommandTarget =
            yield* applyAggregateFrontendReplicaBlock({
              db,
              frontend: main,
              models,
              frontendReplicaBlock: {
                ...localBlock,
                replicaIndex: 2,
                delta: { inserted: [], updated: [], deleted: [] },
                stagedCommandsAdded: [
                  {
                    id: 'cmd_wrong_local_target',
                    commandName: 'createList',
                    payload: '{}',
                    contractVersion: main.contracts.createList.version,
                    commandType: 'frontend',
                    systemName: main.systemName,
                    aggregateId: 'acct_wrong',
                    aggregateName: main.aggregateName,
                    userId: 'user_1',
                    frontendName: main.frontendName,
                    sessionId: 'sesn_wrong_local_target',
                    stagedCursor: 'stcur_wrong_local_target',
                    stagedAt: now,
                    pushedCursor: null,
                    replicaIndex: 2,
                    status: 'staged',
                  },
                ],
              },
              aggregateId: 'acct_1',
              userId: 'user_1',
              systemId: 'sys_1',
              aggregateFrontendLockKey: 'aggregate-lock-key',
              currentFrontendIndex: 0,
              currentReplicaIndex: 1,
              previousReplicaBlock: localBlock,
            }).pipe(Effect.either);
          expect(badLocalCommandTarget._tag).toBe('Left');
          if (badLocalCommandTarget._tag === 'Left') {
            expect(badLocalCommandTarget.left.code).toBe(
              'aggregate-frontend-replica-block-staged-command-target-mismatch',
            );
          }

          const wrongLockKey = yield* applyAggregateFrontendReplicaBlock({
            db,
            frontend: main,
            models,
            frontendReplicaBlock: {
              ...localBlock,
              aggregateFrontendLockKey: 'other-aggregate-lock-key',
              replicaIndex: 2,
              delta: { inserted: [], updated: [], deleted: [] },
            },
            aggregateId: 'acct_1',
            userId: 'user_1',
            systemId: 'sys_1',
            aggregateFrontendLockKey: 'aggregate-lock-key',
            currentFrontendIndex: 0,
            currentReplicaIndex: 1,
            previousReplicaBlock: localBlock,
          }).pipe(Effect.either);
          expect(wrongLockKey._tag).toBe('Left');
          if (wrongLockKey._tag === 'Left') {
            expect(wrongLockKey.left.code).toBe(
              'aggregate-frontend-replica-block-target-mismatch',
            );
          }

          const badServerCommandTarget =
            yield* applyAggregateFrontendReplicaBlock({
              db,
              frontend: main,
              models,
              frontendReplicaBlock: {
                kind: 'server',
                systemId: 'sys_1',
                aggregateId: 'acct_1',
                aggregateName: main.aggregateName,
                userId: 'user_1',
                frontendName: main.frontendName,
                aggregateFrontendLockKey: 'aggregate-lock-key',
                replicaIndex: 2,
                frontendIndex: 1,
                frontendBlock: {
                  frontendName: main.frontendName,
                  lastAggregateCursor: 'acur_wrong_server_target',
                  frontendIndex: 1,
                  delta: { inserted: [], updated: [], deleted: [] },
                  pendingPushedCommands: [
                    {
                      id: 'cmd_wrong_server_target',
                      commandName: 'createList',
                      payload: '{}',
                      contractVersion: main.contracts.createList.version,
                      commandType: 'frontend',
                      systemName: main.systemName,
                      aggregateId: 'acct_1',
                      aggregateName: main.aggregateName,
                      userId: 'user_wrong',
                      frontendName: main.frontendName,
                      sessionId: 'sesn_wrong_server_target',
                      stagedCursor: 'stcur_wrong_server_target',
                      stagedAt: now,
                      replicaIndex: 2,
                      pushedAt: now,
                      pushedCursor: 'pcur_wrong_server_target',
                      status: 'pushed',
                    },
                  ],
                  executedPushedCommands: [],
                  failedPushedCommands: [],
                },
              },
              aggregateId: 'acct_1',
              userId: 'user_1',
              systemId: 'sys_1',
              aggregateFrontendLockKey: 'aggregate-lock-key',
              currentFrontendIndex: 0,
              currentReplicaIndex: 1,
              previousReplicaBlock: localBlock,
            }).pipe(Effect.either);
          expect(badServerCommandTarget._tag).toBe('Left');
          if (badServerCommandTarget._tag === 'Left') {
            expect(badServerCommandTarget.left.code).toBe(
              'aggregate-frontend-replica-block-pending-command-target-mismatch',
            );
          }

          const rollback = yield* applyAggregateFrontendReplicaBlock({
            db,
            frontend: main,
            models,
            frontendReplicaBlock: {
              ...localBlock,
              replicaIndex: 2,
              delta: {
                inserted: [
                  {
                    id: 'lst_would_commit_first',
                    modelName: List.modelName,
                    createdAt: now,
                    updatedAt: now,
                    version: List.version,
                    name: 'First',
                    userId: 'usr_1',
                  },
                  {
                    id: 'lst_invalid_reference',
                    modelName: List.modelName,
                    createdAt: now,
                    updatedAt: now,
                    version: List.version,
                    name: 'Invalid',
                    userId: 'usr_missing',
                  },
                ],
                updated: [],
                deleted: [],
              },
            },
            aggregateId: 'acct_1',
            userId: 'user_1',
            systemId: 'sys_1',
            aggregateFrontendLockKey: 'aggregate-lock-key',
            currentFrontendIndex: 0,
            currentReplicaIndex: 1,
            previousReplicaBlock: localBlock,
          }).pipe(Effect.either);
          expect(rollback._tag).toBe('Left');
          expect(
            db
              .select()
              .from(models.list.drizzleSchema)
              .all()
              .map(row => row.id),
          ).toEqual(['lst_1']);

          const childFirstServerBlock: IAggregateFrontendReplicaBlock = {
            kind: 'server',
            systemId: 'sys_1',
            aggregateId: 'acct_1',
            aggregateName: main.aggregateName,
            userId: 'user_1',
            frontendName: main.frontendName,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            replicaIndex: 2,
            frontendIndex: 1,
            frontendBlock: {
              frontendName: main.frontendName,
              lastAggregateCursor: 'acur_child_first_server',
              frontendIndex: 1,
              delta: {
                inserted: [
                  {
                    id: 'lst_child_first_server',
                    modelName: List.modelName,
                    createdAt: now,
                    updatedAt: now,
                    version: List.version,
                    name: 'Child before server parent',
                    userId: 'usr_child_first_server',
                  },
                  {
                    id: 'usr_child_first_server',
                    modelName: User.modelName,
                    createdAt: now,
                    updatedAt: now,
                    version: User.version,
                    name: 'Server parent',
                  },
                ],
                updated: [],
                deleted: [],
              },
              pendingPushedCommands: [],
              executedPushedCommands: [],
              failedPushedCommands: [],
            },
          };
          expect(
            yield* applyAggregateFrontendReplicaBlock({
              db,
              frontend: main,
              models,
              frontendReplicaBlock: childFirstServerBlock,
              aggregateId: 'acct_1',
              userId: 'user_1',
              systemId: 'sys_1',
              aggregateFrontendLockKey: 'aggregate-lock-key',
              currentFrontendIndex: 0,
              currentReplicaIndex: 1,
              previousReplicaBlock: localBlock,
            }),
          ).toBe('applied');
          expect(
            db
              .select()
              .from(models.list.drizzleSchema)
              .all()
              .map(row => row.id)
              .toSorted(),
          ).toEqual(['lst_1', 'lst_child_first_server'].toSorted());
          expect(
            db
              .select()
              .from(models.user.drizzleSchema)
              .all()
              .map(row => row.id)
              .toSorted(),
          ).toEqual(
            ['usr_1', 'usr_local_parent', 'usr_child_first_server'].toSorted(),
          );
        }),
    );
  });
});
