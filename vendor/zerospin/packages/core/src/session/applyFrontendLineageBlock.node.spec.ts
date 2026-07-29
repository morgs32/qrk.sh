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

import { applyFrontendLineageBlock } from './applyFrontendLineageBlock.ts';
import { applyFrontendReplicaState } from './applyFrontendReplicaState.ts';
import { sessionRepoTables } from './sessionRepoTables.ts';

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('applyFrontendLineageBlock'),
  ErrorLayer,
  TestContext,
  AsyncLive,
);

const now = new Date('2026-01-01T00:00:00.000Z');

describe('applyFrontendLineageBlock', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'applies a direct server suffix and a data-free generation boundary without a replica index',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
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
            schema: dbConfig.schema,
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

          yield* applyFrontendLineageBlock({
            db,
            frontend: main,
            models,
            accountId: 'acct_1',
            actorId: 'actr_1',
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            currentFrontendIndex: 0,
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
                lastAccountCursor: 'acur_direct_lineage_1',
                frontendIndex: 1,
                lastRebasedPushedCursor: null,
                delta: {
                  inserted: [
                    {
                      id: 'lst_direct_lineage_1',
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
            },
          });

          expect(
            db.select().from(models.list.drizzleSchema).all(),
          ).toHaveLength(1);

          const badCommandTarget = yield* applyFrontendLineageBlock({
            db,
            frontend: main,
            models,
            accountId: 'acct_1',
            actorId: 'actr_1',
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            currentFrontendIndex: 1,
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
                lastAccountCursor: 'acur_direct_lineage_bad_target',
                frontendIndex: 2,
                lastRebasedPushedCursor: null,
                delta: { inserted: [], updated: [], deleted: [] },
                pendingPushedCommands: [
                  {
                    id: 'cmd_direct_lineage_bad_target',
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
                    sessionId: 'sesn_direct_lineage_bad_target',
                    stagedCursor: 'stcur_direct_lineage_bad_target',
                    stagedAt: now,
                    pushedAt: now,
                    pushedCursor: 'pcur_direct_lineage_bad_target',
                    status: 'pushed',
                  },
                ],
                executedPushedCommands: [],
                failedPushedCommands: [],
              },
            },
          }).pipe(Effect.either);
          expect(badCommandTarget._tag).toBe('Left');
          if (badCommandTarget._tag === 'Left') {
            expect(badCommandTarget.left.code).toBe(
              'frontend-lineage-block-pending-command-target-mismatch',
            );
          }

          yield* applyFrontendLineageBlock({
            db,
            frontend: main,
            models,
            accountId: 'acct_1',
            actorId: 'actr_1',
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            currentFrontendIndex: 1,
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
              frontendIndex: 2,
            },
          });

          expect(
            db.select().from(models.list.drizzleSchema).all(),
          ).toHaveLength(1);
        }),
    );
  });
});
