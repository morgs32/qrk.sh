import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { eq } from 'drizzle-orm';
import { Effect, Layer } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { encodeCommand } from '../contracts/encodeCommand.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemoryWasmSqliteDb } from '../drizzle/makeMigratedInMemoryWasmSqliteDb.ts';
import { List, main, mainModels } from '../fixtures/system.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { decodeRpc } from '../utils/decodeRpc.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { applyFrontendBlock } from './applyFrontendBlock.ts';
import { applyFrontendReplicaState } from './applyFrontendReplicaState.ts';
import { makeSession } from './makeSession.ts';
import { makeUnstagedCommand } from './makeUnstagedCommand.ts';
import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionFailedCommandDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import { sessionRepoTables } from './sessionRepoTables.ts';
import type { ISessionId } from './types.ts';

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
      'upserts graph delta and reconciles pending pushed commands to server snapshot',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

          const localPushedBase = yield* makeUnstagedCommand({
            accountId: 'acct_1',
            actorId: 'usr_1',
            frontend: main,
            commandName: 'createList',
            payload: {
              id: 'lst_local',
              name: 'Local',
              userId: 'usr_1',
            },
            sessionId: 'sesn_1',
            systemVersion: '1.0.0',
          });
          const localPushed = yield* encodeCommand({
            contract: main.contracts.createList,
            command: {
              ...localPushedBase,
              pushedAt: now,
              pushedCursor: 'pcur_local' as const,
              stagedCursor: 'stcur_local' as const,
              stagedAt: now,
              status: 'pushed' as const,
            },
          });

          const remotePushedBase = yield* makeUnstagedCommand({
            accountId: 'acct_1',
            actorId: 'usr_1',
            frontend: main,
            commandName: 'createList',
            payload: {
              id: 'lst_remote',
              name: 'Remote',
              userId: 'usr_1',
            },
            sessionId: 'sesn_2',
            systemVersion: '1.0.0',
          });
          const remotePushed = yield* encodeCommand({
            contract: main.contracts.createList,
            command: {
              ...remotePushedBase,
              id: 'cmd_remote_pushed',
              pushedAt: now,
              pushedCursor: 'pcur_remote' as const,
              stagedCursor: 'stcur_remote' as const,
              stagedAt: now,
              status: 'pushed' as const,
            },
          });

          yield* applyFrontendReplicaState({
            frontend: main,
            db,
            schema,
            models,
            frontendReplicaState: {
              actorId: 'usr_1',
              accountName: main.accountName,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'stub-deploy',
              frontendIndex: null,
              lastRebasedPushedCursor: localPushed.pushedCursor,
              pushedCommands: [localPushed],
              resources: [],
              stagedCommands: [],
              executedPushedCommands: [],
              failedPushedCommands: [],
            },
          });

          db.insert(models.list.drizzleSchema)
            .values({
              id: 'lst_existing',
              modelName: List.modelName,
              createdAt: now,
              updatedAt: now,
              version: List.version,
              name: 'Legacy',
              userId: 'usr_1',
            })
            .run();
          db.insert(models.list.drizzleSchema)
            .values({
              id: 'lst_removed',
              modelName: List.modelName,
              createdAt: now,
              updatedAt: now,
              version: List.version,
              name: 'ToRemove',
              userId: 'usr_1',
            })
            .run();

          yield* applyFrontendBlock({
            frontend: main,
            db,
            models,
            lastRebasedPushedCursor: localPushed.pushedCursor,
            frontendBlock: {
              frontendName: main.frontendName,
              lastAccountCursor: 'acur_delta',
              delta: {
                inserted: [
                  {
                    id: 'lst_executed',
                    modelName: List.modelName,
                    createdAt: now,
                    updatedAt: now,
                    version: List.version,
                    name: 'Executed',
                    userId: 'usr_1',
                  },
                ],
                updated: [
                  {
                    id: 'lst_existing',
                    modelName: List.modelName,
                    createdAt: now,
                    updatedAt: now,
                    version: List.version,
                    name: 'Executed',
                    userId: 'usr_1',
                  },
                ],
                deleted: [
                  {
                    id: 'lst_removed',
                    modelName: List.modelName,
                  },
                ],
              },
              pendingPushedCommands: [remotePushed],
              executedPushedCommands: [],
              failedPushedCommands: [],
              frontendIndex: 1,
              lastRebasedPushedCursor: remotePushed.pushedCursor,
            },
          });

          const pushedRows = db
            .select()
            .from(sessionPushedCommandDrizzleSchema)
            .all();
          const listRows = db.select().from(models.list.drizzleSchema).all();

          expect(pushedRows).toHaveLength(1);
          expect(pushedRows[0]?.id).toBe(remotePushed.id);
          expect(pushedRows[0]?.pushedCursor).toBe(remotePushed.pushedCursor);
          expect(listRows).toHaveLength(2);
          expect(listRows.find(({ id }) => id === 'lst_executed')).toEqual(
            expect.objectContaining({
              id: 'lst_executed',
            }),
          );
          expect(listRows.find(({ id }) => id === 'lst_existing')).toEqual(
            expect.objectContaining({
              id: 'lst_existing',
              name: 'Executed',
            }),
          );
          expect(
            listRows.find(({ id }) => id === 'lst_removed'),
          ).toBeUndefined();
        }),
    );

    it.effect(
      'upserts executed pushed batch and removes matching pushed rows',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

          const pushedBase = yield* makeUnstagedCommand({
            accountId: 'acct_1',
            actorId: 'usr_1',
            frontend: main,
            commandName: 'createList',
            payload: {
              id: 'lst_1',
              name: 'List',
              userId: 'usr_1',
            },
            sessionId: 'sesn_1',
            systemVersion: '1.0.0',
          });
          const pushedCommand = yield* encodeCommand({
            contract: main.contracts.createList,
            command: {
              ...pushedBase,
              pushedAt: now,
              pushedCursor: 'pcur_finalized' as const,
              stagedCursor: 'stcur_finalized' as const,
              stagedAt: now,
              status: 'pushed' as const,
            },
          });

          yield* applyFrontendReplicaState({
            frontend: main,
            db,
            schema,
            models,
            frontendReplicaState: {
              actorId: 'usr_1',
              accountName: main.accountName,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'stub-deploy',
              frontendIndex: null,
              lastRebasedPushedCursor: pushedCommand.pushedCursor,
              pushedCommands: [pushedCommand],
              resources: [],
              stagedCommands: [],
              executedPushedCommands: [],
              failedPushedCommands: [],
            },
          });

          const executedCommand = {
            id: pushedCommand.id,
            commandName: pushedCommand.commandName,
            payload: pushedCommand.payload,
            systemName: pushedCommand.systemName,
            systemVersion: pushedCommand.systemVersion,
            version: pushedCommand.version,
            commandType: 'frontend' as const,
            accountId: pushedCommand.accountId,
            accountName: pushedCommand.accountName,
            sessionId: pushedCommand.sessionId,
            actorId: pushedCommand.actorId,
            actorName: pushedCommand.actorName,
            frontendName: pushedCommand.frontendName,
            stagedCursor: pushedCommand.stagedCursor,
            stagedAt: pushedCommand.stagedAt,
            pushedAt: pushedCommand.pushedAt,
            pushedCursor: pushedCommand.pushedCursor,
            mode: 'authoritative' as const,
            accountCursor: 'acur_block',
            accountIndex: 1,
            executedAt: now,
            status: 'executed' as const,
          };

          yield* applyFrontendBlock({
            frontend: main,
            db,
            models,
            lastRebasedPushedCursor: pushedCommand.pushedCursor,
            frontendBlock: {
              frontendName: main.frontendName,
              lastAccountCursor: 'acur_block',
              delta: {
                inserted: [],
                updated: [],
                deleted: [],
              },
              pendingPushedCommands: [],
              executedPushedCommands: [executedCommand],
              failedPushedCommands: [],
              frontendIndex: 1,
              lastRebasedPushedCursor: pushedCommand.pushedCursor,
            },
          });

          const pushedRows = db
            .select()
            .from(sessionPushedCommandDrizzleSchema)
            .all();
          const executedRows = db
            .select()
            .from(sessionExecutedPushedCommandDrizzleSchema)
            .all();

          expect(pushedRows).toHaveLength(0);
          expect(executedRows).toHaveLength(1);
          expect(executedRows[0]?.id).toBe(pushedCommand.id);
          expect(executedRows[0]?.accountCursor).toBe('acur_block');
        }),
    );

    it.effect(
      'rolls back optimistic mutations for failed pushed commands',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

          db.insert(models.list.drizzleSchema)
            .values({
              id: 'lst_rollback',
              modelName: List.modelName,
              createdAt: now,
              updatedAt: now,
              version: List.version,
              name: 'Before',
              userId: 'usr_1',
            })
            .run();

          const sessionId = 'sesn_rollback' as ISessionId;
          const session = makeSession({
            frontend: main,
            sessionId,
          });
          session.store.setState({
            sessionId,
            accountId: 'acct_1',
            accountName: main.accountName,
            actorId: 'usr_1',
            generationId: 'gen_test',
            systemWorkerName: 'stub-deploy',
            systemVersion: '1.0.0',
            db,
            schema,
            models,
            vfsName: null,
            isInitialized: true,
            frontendIndex: null,
            lastRebasedPushedCursor: null,
          });

          const staged = yield* Effect.promise(() =>
            session.stageCommand({
              contractName: 'updateList',
              payload: {
                id: 'lst_rollback',
                name: 'Optimistic',
                userId: 'usr_1',
              },
            }),
          ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));

          const optimisticListRow = db
            .select()
            .from(models.list.drizzleSchema)
            .where(eq(models.list.drizzleSchema.id, 'lst_rollback'))
            .get();
          const optimisticRowsBefore = db
            .select()
            .from(sessionOptimisticAppliedMutationDrizzleSchema)
            .all();

          expect(optimisticListRow?.name).toBe('Optimistic');
          expect(optimisticRowsBefore).toHaveLength(1);

          const pushedCommand = yield* encodeCommand({
            contract: main.contracts.updateList,
            command: {
              ...staged,
              commandType: 'frontend',
              pushedAt: now,
              pushedCursor: 'pcur_failed',
              status: 'pushed',
            },
          });

          db.insert(sessionPushedCommandDrizzleSchema)
            .values(pushedCommand)
            .run();

          yield* applyFrontendBlock({
            frontend: main,
            db,
            models,
            lastRebasedPushedCursor: null,
            frontendBlock: {
              frontendName: main.frontendName,
              lastAccountCursor: 'acur_failed',
              delta: {
                inserted: [],
                updated: [],
                deleted: [],
              },
              pendingPushedCommands: [],
              executedPushedCommands: [],
              failedPushedCommands: [
                {
                  ...pushedCommand,
                  accountCursor: 'acur_failed',
                  accountIndex: 1,
                  failedAt: now,
                  failure: 'rejected',
                  status: 'failed',
                },
              ],
              frontendIndex: 1,
              lastRebasedPushedCursor: pushedCommand.pushedCursor,
            },
          });

          const rolledBackListRow = db
            .select()
            .from(models.list.drizzleSchema)
            .where(eq(models.list.drizzleSchema.id, 'lst_rollback'))
            .get();
          const stagedRows = db
            .select()
            .from(sessionStagedCommandDrizzleSchema)
            .all();
          const pushedRows = db
            .select()
            .from(sessionPushedCommandDrizzleSchema)
            .all();
          const failedRows = db
            .select()
            .from(sessionFailedCommandDrizzleSchema)
            .all();
          const optimisticRowsAfter = db
            .select()
            .from(sessionOptimisticAppliedMutationDrizzleSchema)
            .all();

          expect(rolledBackListRow?.name).toBe('Before');
          expect(stagedRows).toHaveLength(0);
          expect(pushedRows).toHaveLength(0);
          expect(failedRows).toHaveLength(1);
          expect(failedRows[0]?.id).toBe(staged.id);
          expect(optimisticRowsAfter).toHaveLength(0);
        }),
    );

    it.effect(
      'drops optimistic metadata for executed commands and keeps server delta',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

          const sessionId = 'sesn_executed' as ISessionId;
          const session = makeSession({
            frontend: main,
            sessionId,
          });
          session.store.setState({
            sessionId,
            accountId: 'acct_1',
            accountName: main.accountName,
            actorId: 'usr_1',
            generationId: 'gen_test',
            systemWorkerName: 'stub-deploy',
            systemVersion: '1.0.0',
            db,
            schema,
            models,
            vfsName: null,
            isInitialized: true,
            frontendIndex: null,
            lastRebasedPushedCursor: null,
          });

          const staged = yield* Effect.promise(() =>
            session.stageCommand({
              contractName: 'createList',
              payload: {
                id: 'lst_executed_optimistic',
                name: 'Local',
                userId: 'usr_1',
              },
            }),
          ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));

          const pushedCommand = yield* encodeCommand({
            contract: main.contracts.createList,
            command: {
              ...staged,
              commandType: 'frontend',
              pushedAt: now,
              pushedCursor: 'pcur_executed',
              status: 'pushed',
            },
          });

          db.insert(sessionPushedCommandDrizzleSchema)
            .values(pushedCommand)
            .run();

          yield* applyFrontendBlock({
            frontend: main,
            db,
            models,
            lastRebasedPushedCursor: null,
            frontendBlock: {
              frontendName: main.frontendName,
              lastAccountCursor: 'acur_executed',
              delta: {
                inserted: [
                  {
                    id: 'lst_executed_optimistic',
                    modelName: List.modelName,
                    createdAt: now,
                    updatedAt: now,
                    version: List.version,
                    name: 'Server',
                    userId: 'usr_1',
                  },
                ],
                updated: [],
                deleted: [],
              },
              pendingPushedCommands: [],
              executedPushedCommands: [
                {
                  ...pushedCommand,
                  mode: 'authoritative',
                  accountCursor: 'acur_executed',
                  accountIndex: 2,
                  executedAt: now,
                  status: 'executed',
                },
              ],
              failedPushedCommands: [],
              frontendIndex: 1,
              lastRebasedPushedCursor: pushedCommand.pushedCursor,
            },
          });

          const listRow = db
            .select()
            .from(models.list.drizzleSchema)
            .where(eq(models.list.drizzleSchema.id, 'lst_executed_optimistic'))
            .get();
          const optimisticRows = db
            .select()
            .from(sessionOptimisticAppliedMutationDrizzleSchema)
            .all();
          const executedRows = db
            .select()
            .from(sessionExecutedPushedCommandDrizzleSchema)
            .all();

          expect(listRow?.name).toBe('Server');
          expect(optimisticRows).toHaveLength(0);
          expect(executedRows).toHaveLength(1);
          expect(executedRows[0]?.id).toBe(staged.id);
        }),
    );

    it.effect(
      'replays pushed overlays newer than the frontend block watermark',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

          db.insert(models.list.drizzleSchema)
            .values({
              id: 'lst_watermark',
              modelName: List.modelName,
              createdAt: now,
              updatedAt: now,
              version: List.version,
              name: 'Embedded pcur 1',
              userId: 'usr_1',
            })
            .run();

          const sessionId = 'sesn_watermark';
          const session = makeSession({ frontend: main, sessionId });
          session.store.setState({
            sessionId,
            accountId: 'acct_1',
            accountName: main.accountName,
            actorId: 'usr_1',
            generationId: 'gen_test',
            systemWorkerName: 'stub-deploy',
            systemVersion: '1.0.0',
            db,
            schema,
            models,
            vfsName: null,
            isInitialized: true,
            frontendIndex: null,
            lastRebasedPushedCursor: 'pcur_0001',
          });

          const staged = yield* Effect.promise(() =>
            session.stageCommand({
              contractName: 'updateList',
              payload: {
                id: 'lst_watermark',
                name: 'Local pcur 3',
                userId: 'usr_1',
              },
            }),
          ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));
          const pushed = yield* encodeCommand({
            contract: main.contracts.updateList,
            command: {
              ...staged,
              pushedAt: now,
              pushedCursor: 'pcur_0003',
              status: 'pushed',
            },
          });
          db.insert(sessionPushedCommandDrizzleSchema).values(pushed).run();
          db.delete(sessionStagedCommandDrizzleSchema)
            .where(eq(sessionStagedCommandDrizzleSchema.id, staged.id))
            .run();

          yield* applyFrontendBlock({
            frontend: main,
            db,
            models,
            lastRebasedPushedCursor: 'pcur_0001',
            frontendBlock: {
              frontendName: main.frontendName,
              lastAccountCursor: 'acur_watermark',
              frontendIndex: 1,
              lastRebasedPushedCursor: 'pcur_0002',
              delta: {
                inserted: [],
                updated: [
                  {
                    id: 'lst_watermark',
                    modelName: List.modelName,
                    createdAt: now,
                    updatedAt: now,
                    version: List.version,
                    name: 'Embedded pcur 2',
                    userId: 'usr_1',
                  },
                ],
                deleted: [],
              },
              pendingPushedCommands: [pushed],
              executedPushedCommands: [],
              failedPushedCommands: [],
            },
          });

          const list = db
            .select()
            .from(models.list.drizzleSchema)
            .where(eq(models.list.drizzleSchema.id, 'lst_watermark'))
            .get();
          const pushedRows = db
            .select()
            .from(sessionPushedCommandDrizzleSchema)
            .all();
          const optimisticRows = db
            .select()
            .from(sessionOptimisticAppliedMutationDrizzleSchema)
            .all();

          expect(list?.name).toBe('Local pcur 3');
          expect(pushedRows).toHaveLength(1);
          expect(optimisticRows).toHaveLength(1);
        }),
    );

    it.effect(
      'keeps a pushed replay failure local until authoritative failure replaces it',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

          db.insert(models.list.drizzleSchema)
            .values({
              id: 'lst_replay_failure',
              modelName: List.modelName,
              createdAt: now,
              updatedAt: now,
              version: List.version,
              name: 'Before',
              userId: 'usr_1',
            })
            .run();

          const sessionId = 'sesn_replay_failure';
          const session = makeSession({ frontend: main, sessionId });
          session.store.setState({
            sessionId,
            accountId: 'acct_1',
            accountName: main.accountName,
            actorId: 'usr_1',
            generationId: 'gen_test',
            systemWorkerName: 'stub-deploy',
            systemVersion: '1.0.0',
            db,
            schema,
            models,
            vfsName: null,
            isInitialized: true,
            frontendIndex: null,
            lastRebasedPushedCursor: 'pcur_0001',
          });

          const staged = yield* Effect.promise(() =>
            session.stageCommand({
              contractName: 'updateList',
              payload: {
                id: 'lst_replay_failure',
                name: 'Optimistic',
                userId: 'usr_1',
              },
            }),
          ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));
          const pushed = yield* encodeCommand({
            contract: main.contracts.updateList,
            command: {
              ...staged,
              pushedAt: now,
              pushedCursor: 'pcur_0003',
              status: 'pushed',
            },
          });
          db.insert(sessionPushedCommandDrizzleSchema).values(pushed).run();
          db.delete(sessionStagedCommandDrizzleSchema)
            .where(eq(sessionStagedCommandDrizzleSchema.id, staged.id))
            .run();

          yield* applyFrontendBlock({
            frontend: main,
            db,
            models,
            lastRebasedPushedCursor: 'pcur_0001',
            frontendBlock: {
              frontendName: main.frontendName,
              lastAccountCursor: 'acur_replay_1',
              frontendIndex: 1,
              lastRebasedPushedCursor: 'pcur_0002',
              delta: {
                inserted: [],
                updated: [],
                deleted: [
                  {
                    id: 'lst_replay_failure',
                    modelName: List.modelName,
                  },
                ],
              },
              pendingPushedCommands: [pushed],
              executedPushedCommands: [],
              failedPushedCommands: [],
            },
          });

          const localFailure = db
            .select()
            .from(sessionFailedCommandDrizzleSchema)
            .where(eq(sessionFailedCommandDrizzleSchema.id, pushed.id))
            .get();
          expect(localFailure).toBeDefined();
          expect(
            db.select().from(sessionPushedCommandDrizzleSchema).all(),
          ).toHaveLength(0);

          yield* applyFrontendBlock({
            frontend: main,
            db,
            models,
            lastRebasedPushedCursor: 'pcur_0002',
            frontendBlock: {
              frontendName: main.frontendName,
              lastAccountCursor: 'acur_replay_2',
              frontendIndex: 2,
              lastRebasedPushedCursor: pushed.pushedCursor,
              delta: { inserted: [], updated: [], deleted: [] },
              pendingPushedCommands: [pushed],
              executedPushedCommands: [
                {
                  ...pushed,
                  mode: 'authoritative',
                  accountCursor: 'acur_replay_2',
                  accountIndex: 2,
                  executedAt: now,
                  status: 'executed',
                },
              ],
              failedPushedCommands: [],
            },
          });

          expect(
            db.select().from(sessionExecutedPushedCommandDrizzleSchema).all(),
          ).toHaveLength(0);
          expect(
            db
              .select()
              .from(sessionFailedCommandDrizzleSchema)
              .where(eq(sessionFailedCommandDrizzleSchema.id, pushed.id))
              .get()?.failure,
          ).toBe(localFailure?.failure);

          yield* applyFrontendBlock({
            frontend: main,
            db,
            models,
            lastRebasedPushedCursor: pushed.pushedCursor,
            frontendBlock: {
              frontendName: main.frontendName,
              lastAccountCursor: 'acur_replay_3',
              frontendIndex: 3,
              lastRebasedPushedCursor: pushed.pushedCursor,
              delta: { inserted: [], updated: [], deleted: [] },
              pendingPushedCommands: [],
              executedPushedCommands: [],
              failedPushedCommands: [
                {
                  ...pushed,
                  accountCursor: 'acur_replay_3',
                  accountIndex: 3,
                  failedAt: now,
                  failure: 'authoritative failure',
                  status: 'failed',
                },
              ],
            },
          });

          expect(
            db
              .select()
              .from(sessionFailedCommandDrizzleSchema)
              .where(eq(sessionFailedCommandDrizzleSchema.id, pushed.id))
              .get()?.failure,
          ).toBe('authoritative failure');
        }),
    );
  });
});
