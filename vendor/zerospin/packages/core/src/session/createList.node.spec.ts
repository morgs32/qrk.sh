import { it } from '@effect/vitest';
import { ZerospinError } from '@zerospin/error';
import { Effect, Either, Layer, Redacted } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemoryWasmSqliteDb } from '../drizzle/makeMigratedInMemoryWasmSqliteDb.ts';
import { main, mainModels, User } from '../fixtures/system.ts';
import { PublishableKey } from '../services/PublishableKey.ts';
import { ZerospinApisUrl } from '../services/ZerospinApisUrl.ts';
import { IncrementalMonotonicFactory } from '../test-utils/IncrementalMonotonicFactory.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { TraceLoggerLayer } from '../test-utils/TraceLoggerLayer.ts';
import { decodeRpc } from '../utils/decodeRpc.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { makeSession } from './makeSession.ts';
import { makeUnstagedCommand } from './makeUnstagedCommand.ts';
import {
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import { sessionRepoTables } from './sessionRepoTables.ts';
import type { ISessionId } from './types.ts';

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('sessionCreateList'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
  AsyncLive,
  Layer.succeed(ZerospinApisUrl, 'https://api.example.com/'),
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
);

describe('createList', () => {
  it.layer(TestLayer)(it => {
    it.effect('create mutations and stage them', () => {
      return Effect.gen(function* () {
        const mutations = yield* main.contracts.createList.program({
          payload: {
            id: 'lst_1',
            name: 'List 1',
            userId: 'usr_1',
          },
        });

        expect(mutations).toMatchObject({
          created: {
            operationName: 'create',
          },
        });

        const models = mainModels;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoTables,
        });
        const { schema } = dbConfig;
        const db = yield* makeMigratedInMemoryWasmSqliteDb({
          dbConfig,
        });
        const now = new Date('2026-01-01T00:00:00.000Z');
        db.insert(User.drizzleSchema)
          .values({
            id: 'usr_1',
            modelName: User.modelName,
            createdAt: now,
            updatedAt: now,
            version: User.version,
            actorId: 'actr_1',
            name: 'User',
          })
          .run();

        const sessionId = 'sesn_1' as ISessionId;
        const session = makeSession({
          frontend: main,
          generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
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
              id: 'lst_1',
              name: 'List 1',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));

        const stagedRows = db
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .all();
        const listRows = db.select().from(models.list.drizzleSchema).all();
        const optimisticRows = db
          .select()
          .from(sessionOptimisticAppliedMutationDrizzleSchema)
          .all();

        expect(stagedRows).toHaveLength(1);
        expect(stagedRows[0]?.id).toBe(staged.id);
        expect(listRows).toHaveLength(1);
        expect(listRows[0]).toEqual(
          expect.objectContaining({
            id: 'lst_1',
            name: 'List 1',
            userId: 'usr_1',
          }),
        );
        expect(optimisticRows).toHaveLength(1);
        expect(optimisticRows[0]?.commandId).toBe(stagedRows[0]?.id);
        const optimisticMutations = JSON.parse(
          optimisticRows[0]?.mutations ?? '[]',
        );
        expect(optimisticMutations).toHaveLength(1);

        const initializedState = session.store.getState();
        if (!initializedState.isInitialized) {
          return yield* Effect.fail(
            new Error('Expected the staged session to remain initialized'),
          );
        }
        session.store.setState({
          workerState: {
            ...initializedState.workerState,
            status: 'update-required',
          },
        });
        const blockedStage = yield* Effect.promise(() =>
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_blocked',
              name: 'Blocked list',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(Either.isLeft(blockedStage)).toBe(true);
        if (Either.isLeft(blockedStage)) {
          expect(blockedStage.left.code).toBe('frontend-update-required');
        }
        expect(
          db.select().from(sessionStagedCommandDrizzleSchema).all(),
        ).toHaveLength(1);
        session.store.setState({
          workerState: {
            ...initializedState.workerState,
            status: 'repairing',
          },
        });
        const repairingStage = yield* Effect.promise(() =>
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_repairing',
              name: 'Repairing list',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(Either.isLeft(repairingStage)).toBe(true);
        if (Either.isLeft(repairingStage)) {
          expect(repairingStage.left.code).toBe('frontend-repairing');
        }
        expect(
          db.select().from(sessionStagedCommandDrizzleSchema).all(),
        ).toHaveLength(1);
      });
    });

    it.effect(
      'rolls back the stage transaction when optimistic apply fails',
      () => {
        return Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({
            dbConfig,
          });

          const sessionId = 'sesn_1' as ISessionId;
          const session = makeSession({
            frontend: main,
            generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
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

          const maybeStaged = yield* Effect.promise(() =>
            session.stageCommand({
              contractName: 'updateList',
              payload: {
                id: 'lst_missing',
                name: 'Missing',
                userId: 'usr_1',
              },
            }),
          ).pipe(
            Effect.flatMap(encoded => decodeRpc(encoded)),
            Effect.either,
          );

          const stagedRows = db
            .select()
            .from(sessionStagedCommandDrizzleSchema)
            .all();
          const listRows = db.select().from(models.list.drizzleSchema).all();
          const optimisticRows = db
            .select()
            .from(sessionOptimisticAppliedMutationDrizzleSchema)
            .all();

          expect(Either.isLeft(maybeStaged)).toBe(true);
          expect(stagedRows).toHaveLength(0);
          expect(listRows).toHaveLength(0);
          expect(optimisticRows).toHaveLength(0);
        });
      },
    );

    it.effect(
      'prepares worker intent without applying it in the main-thread database',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
          let submittedCommandId: string | null = null;
          let submittedBaseReplicaIndex: number | null = null;
          let submittedMutationCount = 0;
          let submittedOperation: string | null = null;

          const session = makeSession({
            frontend: main,
            generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
            sessionId: 'sesn_worker-stage',
            isSharedWorkerEnabled: true,
            stageFrontendCommand: props =>
              Effect.sync(() => {
                submittedCommandId = props.command.id;
                submittedBaseReplicaIndex = props.baseReplicaIndex;
                submittedMutationCount = props.mutations.length;
                submittedOperation = props.mutations[0]?.operation ?? null;
              }),
          });
          session.store.setState({
            sessionId: 'sesn_worker-stage',
            accountId: 'acct_1',
            accountName: main.accountName,
            actorId: 'usr_1',
            systemId: 'sys_test',
            generationId: 'gen_test',
            systemWorkerName: 'stub-deploy',
            systemVersion: '1.0.0',
            frontendName: main.frontendName,
            frontendVersion: main.version,
            db,
            schema,
            models,
            vfsName: null,
            isInitialized: true,
            frontendIndex: 4,
            replicaIndex: 7,
            lastRebasedPushedCursor: null,
            workerState: {
              mode: 'shared-worker',
              status: 'offline',
              bootstrapSource: 'replica',
              frontendIndex: 4,
              replicaIndex: 7,
              databaseName: 'worker-replica',
              failure: null,
            },
          });

          const staged = yield* Effect.promise(() =>
            session.stageCommand({
              contractName: 'createList',
              payload: {
                id: 'lst_worker',
                name: 'Worker list',
                userId: 'usr_1',
              },
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(submittedCommandId).toBe(staged.id);
          expect(submittedBaseReplicaIndex).toBe(7);
          expect(submittedMutationCount).toBe(1);
          expect(submittedOperation).toBe(
            JSON.stringify({
              encodedAttributes: {
                name: 'Worker list',
                userId: 'usr_1',
              },
            }),
          );
          expect(
            db.select().from(sessionStagedCommandDrizzleSchema).all(),
          ).toHaveLength(0);
          expect(
            db.select().from(models.list.drizzleSchema).all(),
          ).toHaveLength(0);
          expect(
            db
              .select()
              .from(sessionOptimisticAppliedMutationDrizzleSchema)
              .all(),
          ).toHaveLength(0);
        }),
    );

    it.effect(
      'reprepares worker intent after consuming a stale replica index',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
          let attemptCount = 0;
          let firstCommandId: string | null = null;
          let firstBaseReplicaIndex: number | null = null;
          let firstMutationCommandId: string | null = null;
          let secondCommandId: string | null = null;
          let secondBaseReplicaIndex: number | null = null;
          let secondMutationCommandId: string | null = null;

          const session = makeSession({
            frontend: main,
            generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
            sessionId: 'sesn_worker-stale-stage',
            isSharedWorkerEnabled: true,
            stageFrontendCommand: props =>
              Effect.gen(function* () {
                attemptCount += 1;
                if (attemptCount === 1) {
                  firstCommandId = props.command.id;
                  firstBaseReplicaIndex = props.baseReplicaIndex;
                  firstMutationCommandId =
                    props.mutations[0]?.commandId ?? null;
                  setTimeout(() => {
                    session.store.setState(state => ({
                      replicaIndex: 8,
                      workerState: {
                        ...state.workerState,
                        replicaIndex: 8,
                      },
                    }));
                    setTimeout(() => {
                      session.store.setState(state => ({
                        replicaIndex: 9,
                        workerState: {
                          ...state.workerState,
                          replicaIndex: 9,
                        },
                      }));
                    }, 0);
                  }, 0);
                  return yield* new ZerospinError({
                    code: 'account-frontend-replica-base-index-stale',
                    message:
                      'The command was prepared against a stale replica index',
                    extra: {
                      expectedReplicaIndex: 9,
                      receivedReplicaIndex: 7,
                    },
                  });
                }
                secondCommandId = props.command.id;
                secondBaseReplicaIndex = props.baseReplicaIndex;
                secondMutationCommandId =
                  props.mutations[0]?.commandId ?? null;
              }),
          });
          session.store.setState({
            sessionId: 'sesn_worker-stale-stage',
            accountId: 'acct_1',
            accountName: main.accountName,
            actorId: 'usr_1',
            systemId: 'sys_test',
            generationId: 'gen_test',
            systemWorkerName: 'stub-deploy',
            systemVersion: '1.0.0',
            frontendName: main.frontendName,
            frontendVersion: main.version,
            db,
            schema,
            models,
            vfsName: null,
            isInitialized: true,
            frontendIndex: 4,
            replicaIndex: 7,
            lastRebasedPushedCursor: null,
            workerState: {
              mode: 'shared-worker',
              status: 'online',
              bootstrapSource: 'replica',
              frontendIndex: 4,
              replicaIndex: 7,
              databaseName: 'worker-replica',
              failure: null,
            },
          });

          const staged = yield* Effect.promise(() =>
            session.stageCommand({
              contractName: 'createList',
              payload: {
                id: 'lst_worker-reprepared',
                name: 'Worker reprepared list',
                userId: 'usr_1',
              },
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(attemptCount).toBe(2);
          expect(firstBaseReplicaIndex).toBe(7);
          expect(secondBaseReplicaIndex).toBe(9);
          expect(firstCommandId).not.toBeNull();
          expect(secondCommandId).not.toBeNull();
          expect(secondCommandId).not.toBe(firstCommandId);
          expect(firstMutationCommandId).toBe(firstCommandId);
          expect(secondMutationCommandId).toBe(secondCommandId);
          expect(secondMutationCommandId).not.toBe(firstMutationCommandId);
          expect(staged.id).toBe(secondCommandId);
          expect(
            db.select().from(sessionStagedCommandDrizzleSchema).all(),
          ).toHaveLength(0);
          expect(
            db.select().from(models.list.drizzleSchema).all(),
          ).toHaveLength(0);
        }),
    );

    it.effect('surfaces repair failure while waiting on a stale replica', () =>
      Effect.gen(function* () {
        const models = mainModels;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoTables,
        });
        const { schema } = dbConfig;
        const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
        let attemptCount = 0;

        const session = makeSession({
          frontend: main,
          generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
          sessionId: 'sesn_worker-stale-repair-failed',
          isSharedWorkerEnabled: true,
          stageFrontendCommand: () =>
            Effect.gen(function* () {
              attemptCount += 1;
              setTimeout(() => {
                session.store.setState(state => ({
                  workerState: {
                    ...state.workerState,
                    status: 'failed',
                    failure: {
                      cause: null,
                      code: 'frontend-session-repair-failed',
                      extra: null,
                      message: 'Account frontend main-thread repair failed',
                      status: null,
                    },
                  },
                }));
              }, 0);
              return yield* new ZerospinError({
                code: 'account-frontend-replica-base-index-stale',
                message:
                  'The command was prepared against a stale replica index',
                extra: {
                  expectedReplicaIndex: 8,
                  receivedReplicaIndex: 7,
                },
              });
            }),
        });
        session.store.setState({
          sessionId: 'sesn_worker-stale-repair-failed',
          accountId: 'acct_1',
          accountName: main.accountName,
          actorId: 'usr_1',
          systemId: 'sys_test',
          generationId: 'gen_test',
          systemWorkerName: 'stub-deploy',
          systemVersion: '1.0.0',
          frontendName: main.frontendName,
          frontendVersion: main.version,
          db,
          schema,
          models,
          vfsName: null,
          isInitialized: true,
          frontendIndex: 4,
          replicaIndex: 7,
          lastRebasedPushedCursor: null,
          workerState: {
            mode: 'shared-worker',
            status: 'online',
            bootstrapSource: 'replica',
            frontendIndex: 4,
            replicaIndex: 7,
            databaseName: 'worker-replica',
            failure: null,
          },
        });

        const failedStage = yield* Effect.promise(() =>
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_worker-stale-repair-failed',
              name: 'Worker stale repair failed list',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);

        expect(attemptCount).toBe(1);
        expect(Either.isLeft(failedStage)).toBe(true);
        if (Either.isLeft(failedStage)) {
          expect(failedStage.left.code).toBe(
            'frontend-session-repair-failed',
          );
        }
        expect(
          db.select().from(sessionStagedCommandDrizzleSchema).all(),
        ).toHaveLength(0);
        expect(
          db.select().from(models.list.drizzleSchema).all(),
        ).toHaveLength(0);
      }),
    );

    it.effect('does not retry a non-stale worker staging failure', () =>
      Effect.gen(function* () {
        const models = mainModels;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoTables,
        });
        const { schema } = dbConfig;
        const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
        let attemptCount = 0;

        const session = makeSession({
          frontend: main,
          generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
          sessionId: 'sesn_worker-failed-stage',
          isSharedWorkerEnabled: true,
          stageFrontendCommand: () =>
            Effect.gen(function* () {
              attemptCount += 1;
              return yield* new ZerospinError({
                code: 'durable-stage-main-thread-application-failed',
                message:
                  'The durable command committed but its local application failed',
              });
            }),
        });
        session.store.setState({
          sessionId: 'sesn_worker-failed-stage',
          accountId: 'acct_1',
          accountName: main.accountName,
          actorId: 'usr_1',
          systemId: 'sys_test',
          generationId: 'gen_test',
          systemWorkerName: 'stub-deploy',
          systemVersion: '1.0.0',
          frontendName: main.frontendName,
          frontendVersion: main.version,
          db,
          schema,
          models,
          vfsName: null,
          isInitialized: true,
          frontendIndex: 4,
          replicaIndex: 7,
          lastRebasedPushedCursor: null,
          workerState: {
            mode: 'shared-worker',
            status: 'online',
            bootstrapSource: 'replica',
            frontendIndex: 4,
            replicaIndex: 7,
            databaseName: 'worker-replica',
            failure: null,
          },
        });

        const failedStage = yield* Effect.promise(() =>
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_worker-failed',
              name: 'Worker failed list',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);

        expect(attemptCount).toBe(1);
        expect(Either.isLeft(failedStage)).toBe(true);
        if (Either.isLeft(failedStage)) {
          expect(failedStage.left.code).toBe(
            'durable-stage-main-thread-application-failed',
          );
        }
        expect(
          db.select().from(sessionStagedCommandDrizzleSchema).all(),
        ).toHaveLength(0);
        expect(
          db.select().from(models.list.drizzleSchema).all(),
        ).toHaveLength(0);
      }),
    );

    it.effect('makeUnstagedCommand', () => {
      return Effect.gen(function* () {
        const createList1 = yield* makeUnstagedCommand({
          accountId: 'acct_1',
          actorId: 'usr_1',
          frontend: main,
          commandName: 'createList',
          payload: {
            id: 'lst_1',
            name: 'List 1',
            userId: 'usr_1',
          },
          sessionId: 'sesn_1',
          systemVersion: '1.0.0',
        });

        expect(createList1.commandName).toBe('createList');
      });
    });
  });
});
