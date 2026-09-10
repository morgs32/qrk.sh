import { it } from '@effect/vitest';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { ZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import { Effect, Exit, Layer, ManagedRuntime, Result, Scope } from 'effect';
import { afterAll, describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { contracts } from '../contracts/index.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemoryWasmSqliteDb } from '../drizzle/makeProvisionedInMemoryWasmSqliteDb.ts';
import {
  List,
  ListModel,
  main,
  mainModels,
  User,
  UserModel,
} from '../fixtures/system.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { IncrementalMonotonicFactory } from '../test-utils/IncrementalMonotonicFactory.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { TraceLoggerLayer } from '../test-utils/TraceLoggerLayer.ts';
import { decodeRpc } from '../utils/decodeRpc.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { makeAggregateSession } from './makeAggregateSession.ts';
import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from './sessionCommandShape.ts';
import {
  sessionMetadataDrizzleSchema,
  sessionRepoTables,
} from './sessionRepoTables.ts';
const guardTestRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

const sessionScope = Scope.makeUnsafe();
Effect.runSync(
  Scope.addFinalizer(sessionScope, guardTestRuntime.disposeEffect),
);
afterAll(() => Effect.runPromise(Scope.close(sessionScope, Exit.void)));

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('sessionCreateList'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  AsyncLive,
);

const now = new Date('2026-01-01T00:00:00.000Z');

const rejectList = contracts.makeVersion(contracts.makeCommand('rejectList'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: ListModel.abbreviation }),
    name: List.propertiesShape.name,
    userId: primitives.foreignKey({ abbreviation: UserModel.abbreviation }),
  },
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
  aggregateVersion: '1.0.0',
  contracts: { rejectList: { contract: rejectList } },
  aggregateName: main.aggregateName,
  name: main.name,
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
          const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
          db.insert(dbConfig.schema.user)
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
          const session = Effect.runSync(
            Effect.map(main.initializeGuards, guards =>
              makeAggregateSession({
                runtime: guardTestRuntime,
                guards,
                frontend: main,
                sessionId: 'sesn_commands',
                executeAggregateFrontendCommand: ({ command }) =>
                  Effect.sync(() => {
                    submitted.push(command.sessionIndex);
                    return { commandId: command.id };
                  }),
              }),
            ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
          );
          session.store.setState({
            sessionId: 'sesn_commands',
            aggregateId: 'acct_1',
            aggregateName: main.aggregateName,
            userId: 'user_1',
            systemId: 'sys_1',
            frontendName: main.name,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema: dbConfig.schema,
            models,
            isInitialized: true,
            aggregateIndex: 0,
            userIndex: 0,
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
          expect(db.select().from(dbConfig.schema.list).all()).toHaveLength(2);
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

          const resumed = Effect.runSync(
            Effect.map(main.initializeGuards, guards =>
              makeAggregateSession({
                runtime: guardTestRuntime,
                guards,
                frontend: main,
                sessionId: 'sesn_commands',
              }),
            ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
          );
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
          const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
          const session = Effect.runSync(
            Effect.map(main.initializeGuards, guards =>
              makeAggregateSession({
                runtime: guardTestRuntime,
                guards,
                frontend: main,
                sessionId: 'sesn_rollback',
              }),
            ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
          );
          session.store.setState({
            sessionId: 'sesn_rollback',
            aggregateId: 'acct_1',
            aggregateName: main.aggregateName,
            userId: 'user_1',
            systemId: 'sys_1',
            frontendName: main.name,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema: dbConfig.schema,
            models,
            isInitialized: true,
            aggregateIndex: 0,
            userIndex: 0,
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
          const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
          const submittedFailures: string[] = [];
          const session = Effect.runSync(
            Effect.map(rejectingFrontend.initializeGuards, guards =>
              makeAggregateSession({
                runtime: guardTestRuntime,
                guards,
                frontend: rejectingFrontend,
                sessionId: 'sesn_failure',
                executeAggregateFrontendCommand: ({ command }) =>
                  Effect.sync(() => {
                    if (command.failure !== null) {
                      submittedFailures.push(command.failure.code);
                    }
                    return { commandId: command.id };
                  }),
              }),
            ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
          );
          session.store.setState({
            sessionId: 'sesn_failure',
            aggregateId: 'acct_1',
            aggregateName: rejectingFrontend.aggregateName,
            userId: 'user_1',
            systemId: 'sys_1',
            frontendName: rejectingFrontend.name,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema: dbConfig.schema,
            models,
            isInitialized: true,
            aggregateIndex: 0,
            userIndex: 0,
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
        const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
        const session = Effect.runSync(
          Effect.map(main.initializeGuards, guards =>
            makeAggregateSession({
              runtime: guardTestRuntime,
              guards,
              frontend: main,
              sessionId: 'sesn_blocked',
            }),
          ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
        );
        session.store.setState({
          sessionId: 'sesn_blocked',
          aggregateId: 'acct_1',
          aggregateName: main.aggregateName,
          userId: 'user_1',
          systemId: 'sys_1',
          frontendName: main.name,
          aggregateFrontendLockKey: 'aggregate-lock-key',
          db,
          schema: dbConfig.schema,
          models,
          isInitialized: true,
          aggregateIndex: 0,
          userIndex: 0,
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
          const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
          db.insert(dbConfig.schema.user)
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
          const session = Effect.runSync(
            Effect.map(main.initializeGuards, guards =>
              makeAggregateSession({
                runtime: guardTestRuntime,
                guards,
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
              }),
            ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
          );
          session.store.setState({
            sessionId: 'sesn_handoff',
            aggregateId: 'acct_1',
            aggregateName: main.aggregateName,
            userId: 'user_1',
            systemId: 'sys_1',
            frontendName: main.name,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema: dbConfig.schema,
            models,
            isInitialized: true,
            aggregateIndex: 0,
            userIndex: 0,
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
          expect(db.select().from(dbConfig.schema.list).all()).toHaveLength(1);
          expect(session.store.getState().sessionStatus).toBe('current');
        }),
    );
  });
});
