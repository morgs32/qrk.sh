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

import { applyFrontendBlock } from './applyFrontendBlock.ts';
import { applyFrontendReplicaState } from './applyFrontendReplicaState.ts';
import { sessionRepoTables } from './sessionRepoTables.ts';
import type { IFrontendReplicaBlock } from './types.ts';

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('applyFrontendBlock'),
  ErrorLayer,
  TestContext,
  AsyncLive,
);

const now = new Date('2026-01-01T00:00:00.000Z');

describe('applyFrontendBlock', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'enforces target and contiguous indices, proves duplicates, rolls back failures, and keeps boundaries data-free',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

          yield* applyFrontendReplicaState({
            frontend: main,
            accountId: 'acct_1',
            actorId: 'actr_1',
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'stub-deploy',
            db,
            schema,
            models,
            frontendReplicaState: {
              accountId: 'acct_1',
              accountName: main.accountName,
              actorId: 'actr_1',
              actorName: main.actorName,
              systemId: 'sys_1',
              generationId: 'gen_1',
              systemVersion: '1.0.0',
              systemWorkerName: 'stub-deploy',
              frontendName: main.frontendName,
              frontendVersion: main.version,
              frontendIndex: 0,
              replicaIndex: 0,
              lastRebasedPushedCursor: null,
              resources: [
                {
                  id: 'usr_1',
                  modelName: User.modelName,
                  createdAt: now,
                  updatedAt: now,
                  version: User.version,
                  actorId: 'actr_1',
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

          const localBlock: IFrontendReplicaBlock = {
            kind: 'local-command',
            systemId: 'sys_1',
            generationId: 'gen_1',
            accountId: 'acct_1',
            accountName: main.accountName,
            actorId: 'actr_1',
            actorName: main.actorName,
            frontendName: main.frontendName,
            frontendVersion: main.version,
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
                  userId: 'usr_1',
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

          const applied = yield* applyFrontendBlock({
            db,
            frontend: main,
            models,
            frontendReplicaBlock: localBlock,
            accountId: 'acct_1',
            actorId: 'actr_1',
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'stub-deploy',
            currentFrontendIndex: 0,
            currentReplicaIndex: 0,
            previousReplicaBlock: null,
          });
          expect(applied).toBe('applied');
          expect(
            db.select().from(models.list.drizzleSchema).all(),
          ).toHaveLength(1);

          const duplicate = yield* applyFrontendBlock({
            db,
            frontend: main,
            models,
            frontendReplicaBlock: localBlock,
            accountId: 'acct_1',
            actorId: 'actr_1',
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'stub-deploy',
            currentFrontendIndex: 0,
            currentReplicaIndex: 1,
            previousReplicaBlock: localBlock,
          });
          expect(duplicate).toBe('duplicate');

          const conflictingDuplicate = yield* applyFrontendBlock({
            db,
            frontend: main,
            models,
            frontendReplicaBlock: {
              ...localBlock,
              delta: { inserted: [], updated: [], deleted: [] },
            },
            accountId: 'acct_1',
            actorId: 'actr_1',
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'stub-deploy',
            currentFrontendIndex: 0,
            currentReplicaIndex: 1,
            previousReplicaBlock: localBlock,
          }).pipe(Effect.either);
          expect(conflictingDuplicate._tag).toBe('Left');

          const gap = yield* applyFrontendBlock({
            db,
            frontend: main,
            models,
            frontendReplicaBlock: { ...localBlock, replicaIndex: 3 },
            accountId: 'acct_1',
            actorId: 'actr_1',
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'stub-deploy',
            currentFrontendIndex: 0,
            currentReplicaIndex: 1,
            previousReplicaBlock: localBlock,
          }).pipe(Effect.either);
          expect(gap._tag).toBe('Left');

          const badLocalCommandTarget = yield* applyFrontendBlock({
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
                  version: main.contracts.createList.version,
                  commandType: 'frontend',
                  systemName: main.systemName,
                  systemVersion: '1.0.0',
                  accountId: 'acct_wrong',
                  accountName: main.accountName,
                  actorId: 'actr_1',
                  actorName: main.actorName,
                  frontendName: main.frontendName,
                  sessionId: 'sesn_wrong_local_target',
                  stagedCursor: 'stcur_wrong_local_target',
                  stagedAt: now,
                  pushedCursor: null,
                  status: 'staged',
                },
              ],
            },
            accountId: 'acct_1',
            actorId: 'actr_1',
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'stub-deploy',
            currentFrontendIndex: 0,
            currentReplicaIndex: 1,
            previousReplicaBlock: localBlock,
          }).pipe(Effect.either);
          expect(badLocalCommandTarget._tag).toBe('Left');
          if (badLocalCommandTarget._tag === 'Left') {
            expect(badLocalCommandTarget.left.code).toBe(
              'frontend-replica-block-staged-command-target-mismatch',
            );
          }

          const badServerCommandTarget = yield* applyFrontendBlock({
            db,
            frontend: main,
            models,
            frontendReplicaBlock: {
              kind: 'server',
              systemId: 'sys_1',
              generationId: 'gen_1',
              accountId: 'acct_1',
              accountName: main.accountName,
              actorId: 'actr_1',
              actorName: main.actorName,
              frontendName: main.frontendName,
              frontendVersion: main.version,
              replicaIndex: 2,
              frontendIndex: 1,
              lineageBlock: {
                kind: 'frontend',
                systemId: 'sys_1',
                generationId: 'gen_1',
                accountId: 'acct_1',
                accountName: main.accountName,
                actorId: 'actr_1',
                actorName: main.actorName,
                frontendName: main.frontendName,
                frontendBlock: {
                  frontendName: main.frontendName,
                  lastAccountCursor: 'acur_wrong_server_target',
                  frontendIndex: 1,
                  lastRebasedPushedCursor: null,
                  delta: { inserted: [], updated: [], deleted: [] },
                  pendingPushedCommands: [
                    {
                      id: 'cmd_wrong_server_target',
                      commandName: 'createList',
                      payload: '{}',
                      version: main.contracts.createList.version,
                      commandType: 'frontend',
                      systemName: main.systemName,
                      systemVersion: '1.0.0',
                      accountId: 'acct_1',
                      accountName: main.accountName,
                      actorId: 'actr_wrong',
                      actorName: main.actorName,
                      frontendName: main.frontendName,
                      sessionId: 'sesn_wrong_server_target',
                      stagedCursor: 'stcur_wrong_server_target',
                      stagedAt: now,
                      pushedAt: now,
                      pushedCursor: 'pcur_wrong_server_target',
                      status: 'pushed',
                    },
                  ],
                  executedPushedCommands: [],
                  failedPushedCommands: [],
                },
              },
            },
            accountId: 'acct_1',
            actorId: 'actr_1',
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'stub-deploy',
            currentFrontendIndex: 0,
            currentReplicaIndex: 1,
            previousReplicaBlock: localBlock,
          }).pipe(Effect.either);
          expect(badServerCommandTarget._tag).toBe('Left');
          if (badServerCommandTarget._tag === 'Left') {
            expect(badServerCommandTarget.left.code).toBe(
              'frontend-lineage-block-pending-command-target-mismatch',
            );
          }

          const rollback = yield* applyFrontendBlock({
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
            accountId: 'acct_1',
            actorId: 'actr_1',
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'stub-deploy',
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

          const boundary: IFrontendReplicaBlock = {
            kind: 'server',
            systemId: 'sys_1',
            generationId: 'gen_1',
            accountId: 'acct_1',
            accountName: main.accountName,
            actorId: 'actr_1',
            actorName: main.actorName,
            frontendName: main.frontendName,
            frontendVersion: main.version,
            replicaIndex: 2,
            frontendIndex: 1,
            lineageBlock: {
              kind: 'generation-boundary',
              systemId: 'sys_1',
              prevGenerationId: 'gen_1',
              generationId: 'gen_2',
              accountId: 'acct_1',
              accountName: main.accountName,
              actorId: 'actr_1',
              actorName: main.actorName,
              frontendName: main.frontendName,
              frontendIndex: 1,
            },
          };
          const appliedBoundary = yield* applyFrontendBlock({
            db,
            frontend: main,
            models,
            frontendReplicaBlock: boundary,
            accountId: 'acct_1',
            actorId: 'actr_1',
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'stub-deploy',
            currentFrontendIndex: 0,
            currentReplicaIndex: 1,
            previousReplicaBlock: localBlock,
          });
          expect(appliedBoundary).toBe('applied');
          expect(
            db
              .select()
              .from(models.list.drizzleSchema)
              .all()
              .map(row => row.id),
          ).toEqual(['lst_1']);
        }),
    );
  });
});
