import { it } from '@effect/vitest';
import { main as authenticationFixtureFrontend } from '@zerospin/core/fixtures/system';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { ZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import {
  Deferred,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Result,
  Scope,
} from 'effect';
import { afterAll, describe, expect } from 'vitest';

import { AsyncLive } from '../../async/AsyncLive.ts';
import { defineContract } from '../../contracts/defineContract.ts';
import { makeContractVersion } from '../../contracts/makeContractVersion.ts';
import { makeResourceDbConfig } from '../../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemoryWasmSqliteDb } from '../../drizzle/makeProvisionedInMemoryWasmSqliteDb.ts';
import {
  List,
  ListModel,
  main,
  mainModels,
  User,
  UserModel,
} from '../../fixtures/system.ts';
import { initializeGuards as initializeFrontendGuards } from '../../frontendController/initializeGuards.ts';
import { makeFrontendController } from '../../frontendController/makeFrontendController.ts';
import { IncrementalMonotonicFactory } from '../../test-utils/IncrementalMonotonicFactory.ts';
import { makePrefixedIncrementalIdFactory } from '../../test-utils/makePrefixedIncrementalIdFactory.ts';
import { TraceLoggerLayer } from '../../test-utils/TraceLoggerLayer.ts';
import { decodeRpc } from '../../utils/decodeRpc.ts';
import { ErrorLayer } from '../../utils/ErrorLayer.ts';
import { makeAggregateSession } from '.././makeAggregateSession.ts';
import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from '.././sessionCommandShape.ts';
import {
  sessionMetadataDrizzleSchema,
  sessionRepoTables,
} from '.././sessionRepoTables.ts';
import { stageCommand } from '.././stageCommand.ts';
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

const rejectList = makeContractVersion(defineContract('rejectList'), {
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
  authenticationSchema:
    authenticationFixtureFrontend.authentication.authenticationSchema,
  aggregateVersion: '1.0.0',
  contracts: { rejectList: { contract: rejectList } },
  aggregateName: main.aggregateName,
  name: main.name,
  systemName: main.systemName,
  models: mainModels,
});

describe('local session command journal', () => {
  it.layer(TestLayer)(it => {
    // 1. Commit two occurrences. 2. Observe both deliveries. 3. Resume the durable index.
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
          const delivered = yield* Deferred.make<void>();
          const session = Effect.runSync(
            Effect.map(initializeFrontendGuards({ frontend: main }), guards => {
              const session = makeAggregateSession({ frontend: main });
              session.setExecutionResources({
                guards,
                sessionId: 'sesn_commands',
                runtime: guardTestRuntime,
                executeAggregateFrontendCommand: ({ command }) =>
                  Effect.sync(() => {
                    submitted.push(command.sessionIndex);
                    if (submitted.length === 2)
                      Effect.runSync(Deferred.succeed(delivered, undefined));
                    return { commandId: command.id };
                  }),
              });
              return session;
            }).pipe(Effect.provideService(Scope.Scope, sessionScope)),
          );
          session.store.setState({
            sessionId: 'sesn_commands',
            aggregateId: 'acct_1',
            aggregateName: main.aggregateName,
            authentication: { userId: 'user_1', aggregateId: 'acct_1' },
            frontendName: main.name,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema: dbConfig.schema,
            models,
            isInitialized: true,
            aggregateIndex: 0,
            selectionIndex: 0,
            selectionHash:
              'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
            pushIndex: 0,
            sessionStatus: 'current',
            backupState: {
              status: 'ready',
              failure: null,
            },
          });

          // 1 — Commit both local occurrences before observing the delivery lane.
          const first = yield* decodeRpc(
            stageCommand({
              session: session,
              contractName: 'createList',
              payload: {
                id: 'lst_1',
                name: 'List 1',
                userId: 'usr_1',
              },
            }),
          );
          const second = yield* decodeRpc(
            stageCommand({
              session: session,
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

          // 2 — The callback completes this barrier after both deliveries.
          yield* Deferred.await(delivered);
          expect(submitted).toEqual([1, 2]);

          // 3 — Rebinding execution resumes from the existing durable metadata.
          const resumed = Effect.runSync(
            Effect.map(initializeFrontendGuards({ frontend: main }), guards => {
              const session = makeAggregateSession({ frontend: main });
              session.setExecutionResources({
                guards,
                sessionId: 'sesn_commands',
                runtime: guardTestRuntime,
              });
              return session;
            }).pipe(Effect.provideService(Scope.Scope, sessionScope)),
          );
          resumed.store.setState({
            ...session.store.getState(),
            telemetry: resumed.store.getState().telemetry,
            telemetryCollector: resumed.store.getState().telemetryCollector,
          });
          const third = yield* decodeRpc(
            stageCommand({
              session: resumed,
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
            Effect.map(initializeFrontendGuards({ frontend: main }), guards => {
              const session = makeAggregateSession({ frontend: main });
              session.setExecutionResources({
                guards,
                sessionId: 'sesn_rollback',
                runtime: guardTestRuntime,
              });
              return session;
            }).pipe(Effect.provideService(Scope.Scope, sessionScope)),
          );
          session.store.setState({
            sessionId: 'sesn_rollback',
            aggregateId: 'acct_1',
            aggregateName: main.aggregateName,
            authentication: { userId: 'user_1', aggregateId: 'acct_1' },
            frontendName: main.name,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema: dbConfig.schema,
            models,
            isInitialized: true,
            aggregateIndex: 0,
            selectionIndex: 0,
            selectionHash:
              'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
            pushIndex: 0,
            sessionStatus: 'current',
            backupState: {
              status: 'ready',
              failure: null,
            },
          });

          const staged = stageCommand({
            session,
            contractName: 'updateList',
            payload: {
              id: 'lst_missing',
              name: 'Missing',
              userId: 'usr_1',
            },
          });
          expect(staged._tag).toBe('Failure');
          expect(staged).not.toHaveProperty('command');
          const result = yield* decodeRpc(staged).pipe(Effect.result);

          expect(Result.isFailure(result)).toBe(true);
          expect(
            db.select().from(sessionCommandJournalDrizzleSchema).all(),
          ).toEqual([]);
          expect(db.select().from(sessionMetadataDrizzleSchema).all()).toEqual(
            [],
          );
        }),
    );

    it.effect.each([false, true])(
      'returns Failure while retaining the complete failed occurrence (settleLocally=%s)',
      settleLocally =>
        Effect.gen(function* () {
          const models = rejectingFrontend.models;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
          const submittedFailures: string[] = [];
          const delivered = yield* Deferred.make<void>();
          const session = Effect.runSync(
            Effect.map(
              initializeFrontendGuards({ frontend: rejectingFrontend }),
              guards => {
                const session = makeAggregateSession({
                  frontend: rejectingFrontend,
                });
                session.setExecutionResources({
                  guards,
                  sessionId: 'sesn_failure',
                  settleLocally,
                  runtime: guardTestRuntime,
                  executeAggregateFrontendCommand: ({ command }) =>
                    Effect.sync(() => {
                      if (command.failure !== null) {
                        submittedFailures.push(command.failure.code);
                      }
                      Effect.runSync(Deferred.succeed(delivered, undefined));
                      return { commandId: command.id };
                    }),
                });
                return session;
              },
            ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
          );
          session.store.setState({
            sessionId: 'sesn_failure',
            aggregateId: 'acct_1',
            aggregateName: rejectingFrontend.aggregateName,
            authentication: { userId: 'user_1', aggregateId: 'acct_1' },
            frontendName: rejectingFrontend.name,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema: dbConfig.schema,
            models,
            isInitialized: true,
            aggregateIndex: 0,
            selectionIndex: 0,
            selectionHash:
              'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
            pushIndex: 0,
            sessionStatus: 'current',
            backupState: {
              status: 'ready',
              failure: null,
            },
          });

          const result = stageCommand({
            session,
            contractName: 'rejectList',
            payload: {
              id: 'lst_rejected',
              name: 'Rejected',
              userId: 'usr_1',
            },
          });
          expect(result).toMatchObject({
            _tag: 'Failure',
            failure: {
              code: 'list-rejected',
              message: 'The list was rejected',
            },
          });
          if (result._tag !== 'Failure' || !('command' in result)) {
            return yield* Effect.die('Expected a journaled staging failure');
          }
          expect(result.command).toMatchObject({
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
          const decoded = yield* decodeRpc(result).pipe(Effect.result);
          expect(decoded).toMatchObject({
            _tag: 'Failure',
            failure: { code: 'list-rejected' },
          });
          expect(db.select().from(dbConfig.schema.list).all()).toEqual([]);
          expect(
            db
              .select()
              .from(sessionOptimisticAppliedMutationDrizzleSchema)
              .all(),
          ).toEqual([]);
          const row = db
            .select()
            .from(sessionCommandJournalDrizzleSchema)
            .get();
          expect(JSON.parse(row?.command ?? '{}')).toMatchObject({
            id: result.command.id,
            sessionIndex: 1,
            failure: {
              code: 'list-rejected',
              message: 'The list was rejected',
            },
          });
          expect(
            db.select().from(sessionMetadataDrizzleSchema).get(),
          ).toMatchObject({ nextSessionIndex: 2 });
          if (!settleLocally) yield* Deferred.await(delivered);
          expect(submittedFailures).toEqual(
            settleLocally ? [] : ['list-rejected'],
          );

          session.clearExecutionResources();
          const unbound = stageCommand({
            session,
            contractName: 'rejectList',
            payload: { id: 'lst_unbound', name: 'Unbound', userId: 'usr_1' },
          });
          expect(unbound).toMatchObject({
            _tag: 'Failure',
            failure: { code: 'aggregate-frontend-session-not-ready' },
          });
          expect(unbound).not.toHaveProperty('command');
          expect(
            db.select().from(sessionCommandJournalDrizzleSchema).all(),
          ).toEqual([row]);
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
          Effect.map(initializeFrontendGuards({ frontend: main }), guards => {
            const session = makeAggregateSession({ frontend: main });
            session.setExecutionResources({
              guards,
              sessionId: 'sesn_blocked',
              runtime: guardTestRuntime,
            });
            return session;
          }).pipe(Effect.provideService(Scope.Scope, sessionScope)),
        );
        session.store.setState({
          sessionId: 'sesn_blocked',
          aggregateId: 'acct_1',
          aggregateName: main.aggregateName,
          authentication: { userId: 'user_1', aggregateId: 'acct_1' },
          frontendName: main.name,
          aggregateFrontendLockKey: 'aggregate-lock-key',
          db,
          schema: dbConfig.schema,
          models,
          isInitialized: true,
          aggregateIndex: 0,
          selectionIndex: 0,
          selectionHash:
            'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
          pushIndex: 0,
          sessionStatus: 'bootstrapping',
          backupState: {
            status: 'repairing',
            failure: null,
          },
        });
        const repairing = yield* decodeRpc(
          stageCommand({
            session: session,
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
          stageCommand({
            session: session,
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
          const delivered = yield* Deferred.make<void>();
          const session = Effect.runSync(
            Effect.map(initializeFrontendGuards({ frontend: main }), guards => {
              const session = makeAggregateSession({ frontend: main });
              session.setExecutionResources({
                guards,
                sessionId: 'sesn_handoff',
                runtime: guardTestRuntime,
                executeAggregateFrontendCommand: () => {
                  attempts += 1;
                  return Effect.fail(
                    new ZerospinError({
                      code: 'handoff-failed',
                      message: 'Handoff failed',
                    }),
                  ).pipe(
                    Effect.ensuring(Deferred.succeed(delivered, undefined)),
                  );
                },
              });
              return session;
            }).pipe(Effect.provideService(Scope.Scope, sessionScope)),
          );
          session.store.setState({
            sessionId: 'sesn_handoff',
            aggregateId: 'acct_1',
            aggregateName: main.aggregateName,
            authentication: { userId: 'user_1', aggregateId: 'acct_1' },
            frontendName: main.name,
            aggregateFrontendLockKey: 'aggregate-lock-key',
            db,
            schema: dbConfig.schema,
            models,
            isInitialized: true,
            aggregateIndex: 0,
            selectionIndex: 0,
            selectionHash:
              'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
            pushIndex: 0,
            sessionStatus: 'current',
            backupState: {
              status: 'ready',
              failure: null,
            },
          });

          yield* decodeRpc(
            stageCommand({
              session: session,
              contractName: 'createList',
              payload: {
                id: 'lst_handoff',
                name: 'Handoff',
                userId: 'usr_1',
              },
            }),
          );
          yield* Deferred.await(delivered);

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
