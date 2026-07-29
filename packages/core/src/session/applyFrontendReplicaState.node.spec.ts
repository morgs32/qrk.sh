import { it } from '@effect/vitest';
import { sql } from 'drizzle-orm';
import { Effect, Layer } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemoryWasmSqliteDb } from '../drizzle/makeMigratedInMemoryWasmSqliteDb.ts';
import { List, main, mainModels, User } from '../fixtures/system.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { applyFrontendReplicaState } from './applyFrontendReplicaState.ts';
import {
  sessionFailedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import { sessionRepoTables } from './sessionRepoTables.ts';

const TestLayer = Layer.mergeAll(
  AsyncLive,
  makePrefixedIncrementalIdFactory('applyFrontendReplicaState'),
  ErrorLayer,
  TestContext,
);

const now = new Date('2026-01-01T00:00:00.000Z');

describe('applyFrontendReplicaState', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'applies an older same-generation replica state and then restores staged commands',
      () =>
        Effect.gen(function* () {
        const models = mainModels;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoTables,
        });
        const { schema } = dbConfig;
        const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

        const stagedCommand = {
          id: 'cmd_1',
          commandName: 'createList',
          payload: JSON.stringify({
            id: 'lst_2',
            name: 'Staged',
            userId: 'usr_1',
          }),
          systemName: main.systemName,
          systemVersion: '1.0.0',
          version: '1.0.0',
          commandType: 'frontend',
          accountId: 'acct_1',
          accountName: main.accountName,
          frontendName: main.frontendName,
          actorId: 'actr_1',
          actorName: main.actorName,
          sessionId: 'sesn_1',
          status: 'staged',
          stagedCursor: 'stcur_1',
          stagedAt: now,
          pushedCursor: null,
        };
        const failedStagedCommand = {
          ...stagedCommand,
          id: 'cmd_failed',
          status: 'failed',
          failedAt: now,
          failure: 'Rejected',
        };

        yield* applyFrontendReplicaState({
          frontend: main,
          accountId: 'acct_1',
          actorId: 'actr_1',
          systemId: 'sys_1',
          generationId: 'gen_1',
          systemVersion: '2.0.0',
          systemWorkerName: 'stub-deploy',
          db,
          schema,
          models,
          frontendReplicaState: {
            accountId: 'acct_1',
            actorId: 'actr_1',
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            accountName: main.accountName,
            actorName: main.actorName,
            frontendName: main.frontendName,
            systemWorkerName: 'stub-deploy',
            frontendIndex: 0,
            frontendVersion: main.version,
            replicaIndex: 0,
            lastRebasedPushedCursor: null,
            pushedCommands: [],
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
              {
                id: 'lst_1',
                modelName: List.modelName,
                createdAt: now,
                updatedAt: now,
                version: List.version,
                name: 'Restored',
                userId: 'usr_1',
              },
            ],
            stagedCommands: [stagedCommand],
            failedStagedCommands: [failedStagedCommand],
            optimisticAppliedMutations: [],
            executedPushedCommands: [],
            failedPushedCommands: [],
          },
        });

        const stagedRows = db
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .all();
        const listRows = db.select().from(models.list.drizzleSchema).all();
        const failedRows = db
          .select()
          .from(sessionFailedCommandDrizzleSchema)
          .all();

        expect(listRows).toHaveLength(1);
        expect(listRows[0]?.id).toBe('lst_1');
        expect(stagedRows).toHaveLength(1);
        expect(stagedRows[0]).toEqual(stagedCommand);
        expect(failedRows).toEqual([
          {
            ...failedStagedCommand,
            pushedAt: null,
            accountCursor: null,
            accountIndex: null,
          },
        ]);
      }),
    );

    it.effect(
      'rolls back a failure after replacement has deleted and inserted rows',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
          const priorFrontendIndex = 4;
          const priorReplicaIndex = 9;
          const priorLastRebasedPushedCursor = 'pcur_prior_replacement';
          const priorStagedCommand = {
            id: 'cmd_prior_replacement',
            commandName: 'createList',
            payload: JSON.stringify({
              id: 'lst_prior_replacement',
              name: 'Prior staged list',
              userId: 'usr_prior_replacement',
            }),
            systemName: main.systemName,
            systemVersion: '1.0.0',
            version: '1.0.0',
            commandType: 'frontend',
            accountId: 'acct_1',
            accountName: main.accountName,
            frontendName: main.frontendName,
            actorId: 'actr_1',
            actorName: main.actorName,
            sessionId: 'sesn_prior_replacement',
            status: 'staged',
            stagedCursor: 'stcur_prior_replacement',
            stagedAt: now,
            pushedCursor: null,
          };

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
              actorId: 'actr_1',
              systemId: 'sys_1',
              generationId: 'gen_1',
              systemVersion: '1.0.0',
              accountName: main.accountName,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'stub-deploy',
              frontendIndex: priorFrontendIndex,
              frontendVersion: main.version,
              replicaIndex: priorReplicaIndex,
              lastRebasedPushedCursor: priorLastRebasedPushedCursor,
              pushedCommands: [],
              resources: [
                {
                  id: 'usr_prior_replacement',
                  modelName: User.modelName,
                  createdAt: now,
                  updatedAt: now,
                  version: User.version,
                  actorId: 'actr_1',
                  name: 'Prior user',
                },
                {
                  id: 'lst_prior_replacement',
                  modelName: List.modelName,
                  createdAt: now,
                  updatedAt: now,
                  version: List.version,
                  name: 'Prior list',
                  userId: 'usr_prior_replacement',
                },
              ],
              stagedCommands: [priorStagedCommand],
              failedStagedCommands: [],
              optimisticAppliedMutations: [],
              executedPushedCommands: [],
              failedPushedCommands: [],
            },
          });

          db.run(
            sql.raw(`
              CREATE TRIGGER reject_injected_replacement_list
              BEFORE INSERT ON "list"
              WHEN NEW.id = 'lst_injected_replacement_failure'
              BEGIN
                SELECT RAISE(ABORT, 'injected replacement failure');
              END;
            `),
          );

          const replacement = yield* applyFrontendReplicaState({
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
              actorId: 'actr_1',
              systemId: 'sys_1',
              generationId: 'gen_1',
              systemVersion: '1.0.0',
              accountName: main.accountName,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'stub-deploy',
              frontendIndex: 5,
              frontendVersion: main.version,
              replicaIndex: 10,
              lastRebasedPushedCursor: null,
              pushedCommands: [],
              resources: [
                {
                  id: 'usr_injected_replacement',
                  modelName: User.modelName,
                  createdAt: now,
                  updatedAt: now,
                  version: User.version,
                  actorId: 'actr_1',
                  name: 'Replacement user',
                },
                {
                  id: 'lst_injected_replacement_failure',
                  modelName: List.modelName,
                  createdAt: now,
                  updatedAt: now,
                  version: List.version,
                  name: 'Replacement list',
                  userId: 'usr_injected_replacement',
                },
              ],
              stagedCommands: [],
              failedStagedCommands: [],
              optimisticAppliedMutations: [],
              executedPushedCommands: [],
              failedPushedCommands: [],
            },
          }).pipe(Effect.either);

          expect(replacement._tag).toBe('Left');
          expect(db.select().from(models.user.drizzleSchema).all()).toEqual([
            expect.objectContaining({
              id: 'usr_prior_replacement',
              name: 'Prior user',
            }),
          ]);
          expect(db.select().from(models.list.drizzleSchema).all()).toEqual([
            expect.objectContaining({
              id: 'lst_prior_replacement',
              name: 'Prior list',
              userId: 'usr_prior_replacement',
            }),
          ]);
          expect(
            db.select().from(sessionStagedCommandDrizzleSchema).all(),
          ).toEqual([priorStagedCommand]);
          expect(priorFrontendIndex).toBe(4);
          expect(priorReplicaIndex).toBe(9);
          expect(priorLastRebasedPushedCursor).toBe('pcur_prior_replacement');
        }),
    );
  });
});
