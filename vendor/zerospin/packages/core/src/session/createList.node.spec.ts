import { it } from '@effect/vitest';
import { ZerospinError } from '@zerospin/error';
import { Effect, Layer, Result, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeContract } from '../contracts/makeContract.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemoryWasmSqliteDb } from '../drizzle/makeProvisionedInMemoryWasmSqliteDb.ts';
import { List, main, mainModels, User } from '../fixtures/system.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { IncrementalMonotonicFactory } from '../test-utils/IncrementalMonotonicFactory.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { TraceLoggerLayer } from '../test-utils/TraceLoggerLayer.ts';
import { decodeRpc } from '../utils/decodeRpc.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { makeSession } from './makeSession.ts';
import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from './sessionCommandShape.ts';
import {
  sessionMetadataDrizzleSchema,
  sessionRepoTables,
} from './sessionRepoTables.ts';

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('sessionCreateList'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  AsyncLive,
);

const now = new Date('2026-01-01T00:00:00.000Z');

const rejectList = makeContract({
  commandName: 'rejectList',
  payload: {
    id: List.primaryKey({ autogenerate: false }),
    name: List.propertiesShape.name,
    userId: User.primaryKey({ autogenerate: false }),
  },
  mutations: Schema.Struct({
    created: List.createMutation('1.0.0'),
  }),
  program: () =>
    Effect.fail(
      new ZerospinError({
        code: 'list-rejected',
        message: 'The list was rejected',
      }),
    ),
  version: '1.0.0',
});

const rejectingFrontend = makeFrontendController({
  contracts: { rejectList },
  aggregateName: main.aggregateName,
  frontendName: main.frontendName,
  systemName: main.systemName,
  models: mainModels,
});

describe('local session command journal', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'commits complete occurrences, hands them off once, and resumes the durable session index',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
          db.insert(schema.user)
            .values({
              id: 'usr_1',
              modelName: User.modelName,
              createdAt: now,
              updatedAt: now,
              version: User.version,
              name: 'User',
            })
            .run();
          const submitted: number[] = [];
          const session = makeSession({
            frontend: main,
            sessionId: 'sesn_commands',
            executeAggregateFrontendCommand: ({ command }) =>
              Effect.sync(() => {
                submitted.push(command.sessionIndex);
                return { commandId: command.id };
              }),
          });
          session.store.setState({
            sessionId: 'sesn_commands',
            aggregateId: 'acct_1',
            aggregateName: main.aggregateName,
            userId: 'user_1',
            systemId: 'sys_1',
            systemVersion: '1.0.0',
            frontendName: main.frontendName,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema,
            models,
            isInitialized: true,
            aggregateIndex: 0,
            frontendIndex: 0,
            pushIndex: 0,
            sessionStatus: 'current',
            backupState: {
              status: 'ready',
              failure: null,
            },
          });

          const first = yield* decodeRpc(
            session.executeCommand({
              contractName: 'createList',
              payload: {
                id: 'lst_1',
                name: 'List 1',
                userId: 'usr_1',
              },
            }),
          );
          const second = yield* decodeRpc(
            session.executeCommand({
              contractName: 'createList',
              payload: {
                id: 'lst_2',
                name: 'List 2',
                userId: 'usr_1',
              },
            }),
          );

          expect([first.sessionIndex, second.sessionIndex]).toEqual([1, 2]);
          expect(first.delta?.inserted).toEqual([
            expect.objectContaining({ id: 'lst_1', name: 'List 1' }),
          ]);
          const rows = db
            .select()
            .from(sessionCommandJournalDrizzleSchema)
            .all();
          expect(rows).toHaveLength(2);
          expect(JSON.parse(rows[0]?.command ?? '{}')).toMatchObject({
            id: first.id,
            sessionIndex: 1,
            pushIndex: null,
            failedAt: null,
            delta: {
              inserted: [expect.objectContaining({ id: 'lst_1' })],
              mutations: [expect.objectContaining({ commandId: first.id })],
            },
          });
          expect(
            db.select().from(sessionMetadataDrizzleSchema).get(),
          ).toMatchObject({ nextSessionIndex: 3 });
          expect(db.select().from(schema.list).all()).toHaveLength(2);
          expect(
            db
              .select()
              .from(sessionOptimisticAppliedMutationDrizzleSchema)
              .all(),
          ).toHaveLength(2);

          yield* Effect.promise(
            () => new Promise<void>(resolve => setTimeout(resolve, 25)),
          );
          expect(submitted).toEqual([1, 2]);

          const resumed = makeSession({
            frontend: main,
            sessionId: 'sesn_commands',
          });
          resumed.store.setState({
            ...session.store.getState(),
            telemetry: resumed.store.getState().telemetry,
            telemetryCollector: resumed.store.getState().telemetryCollector,
          });
          const third = yield* decodeRpc(
            resumed.executeCommand({
              contractName: 'createList',
              payload: {
                id: 'lst_3',
                name: 'List 3',
                userId: 'usr_1',
              },
            }),
          );
          expect(third.sessionIndex).toBe(3);
          expect(
            db.select().from(sessionMetadataDrizzleSchema).get(),
          ).toMatchObject({ nextSessionIndex: 4 });
        }),
    );

    it.effect(
      'rolls the transaction back when optimistic application fails',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
          const session = makeSession({
            frontend: main,
            sessionId: 'sesn_rollback',
          });
          session.store.setState({
            sessionId: 'sesn_rollback',
            aggregateId: 'acct_1',
            aggregateName: main.aggregateName,
            userId: 'user_1',
            systemId: 'sys_1',
            systemVersion: '1.0.0',
            frontendName: main.frontendName,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema,
            models,
            isInitialized: true,
            aggregateIndex: 0,
            frontendIndex: 0,
            pushIndex: 0,
            sessionStatus: 'current',
            backupState: {
              status: 'ready',
              failure: null,
            },
          });

          const result = yield* decodeRpc(
            session.executeCommand({
              contractName: 'updateList',
              payload: {
                id: 'lst_missing',
                name: 'Missing',
                userId: 'usr_1',
              },
            }),
          ).pipe(Effect.result);

          expect(Result.isFailure(result)).toBe(true);
          expect(
            db.select().from(sessionCommandJournalDrizzleSchema).all(),
          ).toEqual([]);
          expect(db.select().from(sessionMetadataDrizzleSchema).all()).toEqual(
            [],
          );
        }),
    );

    it.effect(
      'retains an authored failure as a complete ordered occurrence',
      () =>
        Effect.gen(function* () {
          const models = rejectingFrontend.models;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
          const submittedFailures: string[] = [];
          const session = makeSession({
            frontend: rejectingFrontend,
            sessionId: 'sesn_failure',
            executeAggregateFrontendCommand: ({ command }) =>
              Effect.sync(() => {
                if (command.failure !== null) {
                  submittedFailures.push(command.failure.code);
                }
                return { commandId: command.id };
              }),
          });
          session.store.setState({
            sessionId: 'sesn_failure',
            aggregateId: 'acct_1',
            aggregateName: rejectingFrontend.aggregateName,
            userId: 'user_1',
            systemId: 'sys_1',
            systemVersion: '1.0.0',
            frontendName: rejectingFrontend.frontendName,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema,
            models,
            isInitialized: true,
            aggregateIndex: 0,
            frontendIndex: 0,
            pushIndex: 0,
            sessionStatus: 'current',
            backupState: {
              status: 'ready',
              failure: null,
            },
          });

          const failed = yield* decodeRpc(
            session.executeCommand({
              contractName: 'rejectList',
              payload: {
                id: 'lst_rejected',
                name: 'Rejected',
                userId: 'usr_1',
              },
            }),
          );
          expect(failed).toMatchObject({
            sessionIndex: 1,
            failedAt: expect.any(Date),
            failure: {
              code: 'list-rejected',
              message: 'The list was rejected',
            },
            delta: {
              inserted: [],
              updated: [],
              deleted: [],
              mutations: [],
            },
          });
          const row = db
            .select()
            .from(sessionCommandJournalDrizzleSchema)
            .get();
          expect(JSON.parse(row?.command ?? '{}')).toMatchObject({
            sessionIndex: 1,
            failure: {
              code: 'list-rejected',
              message: 'The list was rejected',
            },
          });
          expect(
            db.select().from(sessionMetadataDrizzleSchema).get(),
          ).toMatchObject({ nextSessionIndex: 2 });
          yield* Effect.promise(
            () => new Promise<void>(resolve => setTimeout(resolve, 25)),
          );
          expect(submittedFailures).toEqual(['list-rejected']);
        }),
    );

    it.effect('blocks new local commands unless the session is current', () =>
      Effect.gen(function* () {
        const models = mainModels;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoTables,
        });
        const { schema } = dbConfig;
        const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
        const session = makeSession({
          frontend: main,
          sessionId: 'sesn_blocked',
        });
        session.store.setState({
          sessionId: 'sesn_blocked',
          aggregateId: 'acct_1',
          aggregateName: main.aggregateName,
          userId: 'user_1',
          systemId: 'sys_1',
          systemVersion: '1.0.0',
          frontendName: main.frontendName,
          aggregateFrontendLockKey: 'aggregate-lock-key',
          db,
          schema,
          models,
          isInitialized: true,
          aggregateIndex: 0,
          frontendIndex: 0,
          pushIndex: 0,
          sessionStatus: 'bootstrapping',
          backupState: {
            status: 'repairing',
            failure: null,
          },
        });
        const repairing = yield* decodeRpc(
          session.executeCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_repairing',
              name: 'Repairing',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.result);
        expect(Result.isFailure(repairing)).toBe(true);

        const initialized = session.store.getState();
        if (!initialized.isInitialized) {
          return yield* Effect.die('Expected initialized session');
        }
        session.store.setState({ sessionStatus: 'failed' });
        const failed = yield* decodeRpc(
          session.executeCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_failed',
              name: 'Failed',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.result);
        expect(Result.isFailure(failed)).toBe(true);
        expect(
          db.select().from(sessionCommandJournalDrizzleSchema).all(),
        ).toEqual([]);
      }),
    );

    it.effect(
      'keeps the committed journal when the one handoff attempt fails',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
          db.insert(schema.user)
            .values({
              id: 'usr_1',
              modelName: User.modelName,
              createdAt: now,
              updatedAt: now,
              version: User.version,
              name: 'User',
            })
            .run();
          let attempts = 0;
          const session = makeSession({
            frontend: main,
            sessionId: 'sesn_handoff',
            executeAggregateFrontendCommand: () => {
              attempts += 1;
              return Effect.fail(
                new ZerospinError({
                  code: 'handoff-failed',
                  message: 'Handoff failed',
                }),
              );
            },
          });
          session.store.setState({
            sessionId: 'sesn_handoff',
            aggregateId: 'acct_1',
            aggregateName: main.aggregateName,
            userId: 'user_1',
            systemId: 'sys_1',
            systemVersion: '1.0.0',
            frontendName: main.frontendName,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema,
            models,
            isInitialized: true,
            aggregateIndex: 0,
            frontendIndex: 0,
            pushIndex: 0,
            sessionStatus: 'current',
            backupState: {
              status: 'ready',
              failure: null,
            },
          });

          yield* decodeRpc(
            session.executeCommand({
              contractName: 'createList',
              payload: {
                id: 'lst_handoff',
                name: 'Handoff',
                userId: 'usr_1',
              },
            }),
          );
          yield* Effect.promise(
            () => new Promise<void>(resolve => setTimeout(resolve, 25)),
          );

          expect(attempts).toBe(1);
          expect(
            db.select().from(sessionCommandJournalDrizzleSchema).all(),
          ).toHaveLength(1);
          expect(db.select().from(schema.list).all()).toHaveLength(1);
          expect(session.store.getState().sessionStatus).toBe('current');
        }),
    );
  });
});
