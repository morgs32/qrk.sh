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
import { ZerospinApiUrl } from '../services/ZerospinApiUrl.ts';
import { IncrementalMonotonicFactory } from '../test-utils/IncrementalMonotonicFactory.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { TraceLoggerLayer } from '../test-utils/TraceLoggerLayer.ts';
import { decodeRpc } from '../utils/decodeRpc.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { makeSession } from './makeSession.ts';
import { makeUnstagedCommand } from './makeUnstagedCommand.ts';
import {
  sessionFailedCommandDrizzleSchema,
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
  Layer.succeed(ZerospinApiUrl, 'https://api.example.com/'),
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
            userId: 'user_1',
            name: 'User',
          })
          .run();

        const sessionId = 'sesn_1' as ISessionId;
        const session = makeSession({
          frontend: main,
          sessionId,
        });
        session.store.setState({
          sessionId,
          aggregateId: 'acct_1',
          aggregateName: main.aggregateName,
          userId: 'usr_1',
          systemId: 'sys_test',
          systemVersion: '1.0.0',
          frontendName: main.frontendName,
          aggregateFrontendLockKey: 'aggregate-lock-key',
          db,
          schema,
          models,
          vfsName: null,
          isInitialized: true,
          frontendIndex: 0,
          replicaIndex: null,
        });

        const staged = yield* decodeRpc(
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_1',
              name: 'List 1',
              userId: 'usr_1',
            },
          }),
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
            status: 'failed',
            failure: {
              code: 'aggregate-frontend-lock-unsupported',
              message: 'The active System cannot support this frontend lock',
            },
          },
        });
        const blockedStage = yield* decodeRpc(
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_blocked',
              name: 'Blocked list',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.either);
        expect(Either.isLeft(blockedStage)).toBe(true);
        if (Either.isLeft(blockedStage)) {
          expect(blockedStage.left.code).toBe(
            'aggregate-frontend-lock-unsupported',
          );
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
        const repairingStage = yield* decodeRpc(
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_repairing',
              name: 'Repairing list',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.either);
        expect(Either.isLeft(repairingStage)).toBe(true);
        if (Either.isLeft(repairingStage)) {
          expect(repairingStage.left.code).toBe('aggregate-frontend-repairing');
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
            sessionId,
          });
          session.store.setState({
            sessionId,
            aggregateId: 'acct_1',
            aggregateName: main.aggregateName,
            userId: 'usr_1',
            systemId: 'sys_test',
            systemVersion: '1.0.0',
            frontendName: main.frontendName,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema,
            models,
            vfsName: null,
            isInitialized: true,
            frontendIndex: 0,
            replicaIndex: null,
          });

          const maybeStaged = yield* decodeRpc(
            session.stageCommand({
              contractName: 'updateList',
              payload: {
                id: 'lst_missing',
                name: 'Missing',
                userId: 'usr_1',
              },
            }),
          ).pipe(Effect.either);

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
      'commits synchronously before one durable handoff and advances session order',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
          const now = new Date('2026-01-01T00:00:00.000Z');
          db.insert(User.drizzleSchema)
            .values({
              id: 'usr_1',
              modelName: User.modelName,
              createdAt: now,
              updatedAt: now,
              version: User.version,
              userId: 'user_1',
              name: 'User',
            })
            .run();
          const submitted: Array<
            Readonly<{
              commandId: string;
              sessionIndex: number;
              mutationCount: number;
              handoffHasReplicaIndex: boolean;
            }>
          > = [];
          const session = makeSession({
            frontend: main,
            sessionId: 'sesn_worker-stage',
            stageAggregateFrontendCommand: props =>
              Effect.sync(() => {
                submitted.push({
                  commandId: props.command.id,
                  sessionIndex: props.sessionIndex,
                  mutationCount: props.mutations.length,
                  handoffHasReplicaIndex: 'replicaIndex' in props.command,
                });
                return {
                  commandId: props.command.id,
                };
              }),
          });
          session.store.setState({
            sessionId: 'sesn_worker-stage',
            aggregateId: 'acct_1',
            aggregateName: main.aggregateName,
            userId: 'usr_1',
            systemId: 'sys_test',
            systemVersion: '1.0.0',
            frontendName: main.frontendName,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema,
            models,
            vfsName: null,
            isInitialized: true,
            frontendIndex: 4,
            replicaIndex: 7,
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

          const first = yield* decodeRpc(
            session.stageCommand({
              contractName: 'createList',
              payload: {
                id: 'lst_worker-1',
                name: 'Worker list 1',
                userId: 'usr_1',
              },
            }),
          );
          const second = yield* decodeRpc(
            session.stageCommand({
              contractName: 'createList',
              payload: {
                id: 'lst_worker-2',
                name: 'Worker list 2',
                userId: 'usr_1',
              },
            }),
          );

          const stagedRows = db
            .select()
            .from(sessionStagedCommandDrizzleSchema)
            .all();
          expect(stagedRows).toHaveLength(2);
          expect(stagedRows.every(row => row.replicaIndex === null)).toBe(true);
          expect(
            db.select().from(models.list.drizzleSchema).all(),
          ).toHaveLength(2);
          expect(
            db
              .select()
              .from(sessionOptimisticAppliedMutationDrizzleSchema)
              .all(),
          ).toHaveLength(2);

          yield* Effect.promise(
            () => new Promise<void>(resolve => setTimeout(resolve, 25)),
          );
          expect(submitted).toEqual([
            {
              commandId: first.id,
              sessionIndex: 1,
              mutationCount: 1,
              handoffHasReplicaIndex: false,
            },
            {
              commandId: second.id,
              sessionIndex: 2,
              mutationCount: 1,
              handoffHasReplicaIndex: false,
            },
          ]);
        }),
    );

    it.effect(
      'keeps local optimism and fails the session after a one-attempt handoff failure',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
          const now = new Date('2026-01-01T00:00:00.000Z');
          db.insert(User.drizzleSchema)
            .values({
              id: 'usr_1',
              modelName: User.modelName,
              createdAt: now,
              updatedAt: now,
              version: User.version,
              userId: 'user_1',
              name: 'User',
            })
            .run();
          let attemptCount = 0;
          const session = makeSession({
            frontend: main,
            sessionId: 'sesn_worker-handoff-failed',
            stageAggregateFrontendCommand: () =>
              Effect.sync(() => {
                attemptCount += 1;
              }).pipe(
                Effect.zipRight(
                  Effect.fail(
                    new ZerospinError({
                      code: 'shared-worker-handoff-failed',
                      message: 'The single browser handoff failed',
                    }),
                  ),
                ),
              ),
          });
          session.store.setState({
            sessionId: 'sesn_worker-handoff-failed',
            aggregateId: 'acct_1',
            aggregateName: main.aggregateName,
            userId: 'usr_1',
            systemId: 'sys_test',
            systemVersion: '1.0.0',
            frontendName: main.frontendName,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema,
            models,
            vfsName: null,
            isInitialized: true,
            frontendIndex: 4,
            replicaIndex: 7,
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

          const staged = yield* decodeRpc(
            session.stageCommand({
              contractName: 'createList',
              payload: {
                id: 'lst_worker-failed',
                name: 'Worker failed list',
                userId: 'usr_1',
              },
            }),
          );
          expect(staged.id).toBeTruthy();
          expect(
            db.select().from(models.list.drizzleSchema).all(),
          ).toHaveLength(1);
          expect(
            db
              .select()
              .from(sessionOptimisticAppliedMutationDrizzleSchema)
              .all(),
          ).toHaveLength(1);

          yield* Effect.promise(
            () => new Promise<void>(resolve => setTimeout(resolve, 25)),
          );
          expect(attemptCount).toBe(1);
          expect(
            db.select().from(sessionStagedCommandDrizzleSchema).all(),
          ).toHaveLength(0);
          expect(
            db.select().from(sessionFailedCommandDrizzleSchema).all(),
          ).toHaveLength(1);
          expect(
            db.select().from(models.list.drizzleSchema).all(),
          ).toHaveLength(1);
          expect(
            db
              .select()
              .from(sessionOptimisticAppliedMutationDrizzleSchema)
              .all(),
          ).toHaveLength(1);
          expect(session.store.getState().workerState.status).toBe('failed');

          const blocked = yield* decodeRpc(
            session.stageCommand({
              contractName: 'createList',
              payload: {
                id: 'lst_after-failure',
                name: 'After failure',
                userId: 'usr_1',
              },
            }),
          ).pipe(Effect.either);
          expect(Either.isLeft(blocked)).toBe(true);
          expect(attemptCount).toBe(1);
        }),
    );
    it.effect('makeUnstagedCommand', () => {
      return Effect.gen(function* () {
        const createList1 = yield* makeUnstagedCommand({
          aggregateId: 'acct_1',
          userId: 'usr_1',
          frontend: main,
          commandName: 'createList',
          payload: {
            id: 'lst_1',
            name: 'List 1',
            userId: 'usr_1',
          },
          sessionId: 'sesn_1',
        });

        expect(createList1.commandName).toBe('createList');
      });
    });
  });
});
