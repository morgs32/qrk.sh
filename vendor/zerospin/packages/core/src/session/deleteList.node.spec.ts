import { it } from '@effect/vitest';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { Effect, Exit, Layer, ManagedRuntime, Result, Scope } from 'effect';
import { afterAll, describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemoryWasmSqliteDb } from '../drizzle/makeProvisionedInMemoryWasmSqliteDb.ts';
import { main, mainModels, User } from '../fixtures/system.ts';
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
import { sessionRepoTables } from './sessionRepoTables.ts';
const guardTestRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

const sessionScope = Scope.makeUnsafe();
Effect.runSync(
  Scope.addFinalizer(sessionScope, guardTestRuntime.disposeEffect),
);
afterAll(() => Effect.runPromise(Scope.close(sessionScope, Exit.void)));

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('sessionDeleteList'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  AsyncLive,
);

const now = new Date('2026-01-01T00:00:00.000Z');

describe('deleteList local occurrence', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'retains the delete and its full-row inverse in journal order',
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
          const session = Effect.runSync(
            Effect.map(main.initializeGuards, guards =>
              makeAggregateSession({
                runtime: guardTestRuntime,
                guards,
                frontend: main,
                sessionId: 'sesn_delete',
              }),
            ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
          );
          session.store.setState({
            sessionId: 'sesn_delete',
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
                id: 'lst_1',
                name: 'List 1',
                userId: 'usr_1',
              },
            }),
          );
          const deleted = yield* decodeRpc(
            session.executeCommand({
              contractName: 'deleteList',
              payload: { id: 'lst_1' },
            }),
          );

          expect(deleted).toMatchObject({
            sessionIndex: 2,
            delta: { deleted: [{ id: 'lst_1', modelName: 'list' }] },
          });
          const rows = db
            .select()
            .from(sessionCommandJournalDrizzleSchema)
            .all();
          expect(rows.map(row => row.sessionIndex)).toEqual([1, 2]);
          const optimisticRows = db
            .select()
            .from(sessionOptimisticAppliedMutationDrizzleSchema)
            .all();
          const deleteMutations = JSON.parse(
            optimisticRows[1]?.mutations ?? '[]',
          );
          expect(
            JSON.parse(deleteMutations[0]?.inverseOperation ?? '{}'),
          ).toMatchObject({
            resource: {
              id: 'lst_1',
              name: 'List 1',
              userId: 'usr_1',
            },
          });
        }),
    );

    it.effect('rolls back a delete whose source row is missing', () =>
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
              sessionId: 'sesn_missing_delete',
            }),
          ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
        );
        session.store.setState({
          sessionId: 'sesn_missing_delete',
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
            contractName: 'deleteList',
            payload: { id: 'lst_missing' },
          }),
        ).pipe(Effect.result);

        expect(Result.isFailure(result)).toBe(true);
        expect(
          db.select().from(sessionCommandJournalDrizzleSchema).all(),
        ).toEqual([]);
      }),
    );
  });
});
