import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { AggregateExecutionEntrySchema } from '@zerospin/core/contracts/CommandSchema';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { List, main, mainModels, User } from '@zerospin/core/fixtures/system';
import { applyAggregateFrontendCommand } from '@zerospin/core/session/applyAggregateFrontendCommand';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import {
  sessionMetadataDrizzleSchema,
  sessionRepoTables,
} from '@zerospin/core/session/sessionRepoTables';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { Effect, Exit, Layer, ManagedRuntime, Schema, Scope } from 'effect';
import { afterAll, expect, it } from 'vitest';

const guardTestRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

const sessionScope = Scope.makeUnsafe();
Effect.runSync(
  Scope.addFinalizer(sessionScope, guardTestRuntime.disposeEffect),
);
afterAll(() => Effect.runPromise(Scope.close(sessionScope, Exit.void)));

it('resolves only the originating optimism, replays the rest, and rejects skipped output positions', async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const dbConfig = makeResourceDbConfig({
        models: mainModels,
        otherTables: sessionRepoTables,
      });
      const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
      const now = new Date('2026-01-01T00:00:00Z');
      db.insert(User.drizzleSchema)
        .values({
          id: 'usr_1',
          modelName: 'user',
          version: User.version,
          createdAt: now,
          updatedAt: now,
          name: 'User',
        })
        .run();
      const session = Effect.runSync(
        Effect.map(main.initializeGuards, guards =>
          makeAggregateSession({
            runtime: guardTestRuntime,
            guards,
            frontend: main,
            sessionId: 'sesn_resolution',
            executeAggregateFrontendCommand: ({ command }) =>
              Effect.succeed({ commandId: command.id }),
          }),
        ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
      );
      session.store.setState({
        sessionId: 'sesn_resolution',
        aggregateId: 'acct_1',
        aggregateName: main.aggregateName,
        userId: 'usr_1',
        systemId: 'sys_1',
        frontendName: main.name,
        aggregateFrontendLockKey: 'lock',
        db,
        schema: dbConfig.schema,
        models: mainModels,
        isInitialized: true,
        aggregateIndex: 0,
        userIndex: 0,
        pushIndex: 0,
        sessionStatus: 'current',
        backupState: { status: 'ready', failure: null },
      });
      const first = yield* decodeRpc(
        session.executeCommand({
          contractName: 'createList',
          payload: { id: 'lst_first', name: 'First', userId: 'usr_1' },
        }),
      );
      yield* decodeRpc(
        session.executeCommand({
          contractName: 'createList',
          payload: { id: 'lst_second', name: 'Second', userId: 'usr_1' },
        }),
      );
      expect(db.select().from(List.drizzleSchema).all()).toHaveLength(2);
      const sourceCommand = db
        .select()
        .from(sessionCommandJournalDrizzleSchema)
        .all()
        .find(row => row.id === first.id)!.command;
      const resolution = yield* Schema.decodeUnknownEffect(
        Schema.toType(AggregateExecutionEntrySchema),
      )({
        sourceCommand,
        command: {
          ...first,
          payload: JSON.stringify(first.payload),
          aggregateIndex: 1,
          delta: null,
          dispositionHash: 'a'.repeat(64),
          failedAt: now,
          failure: {
            code: 'rejected',
            message: 'Rejected',
            cause: null,
            extra: null,
            status: null,
          },
        },
        preparationVersion: '1.0.0',
        executionTimestamp: now,
        mutations: [],
      });
      const output = {
        userIndex: 1,
        aggregateIndex: 1,
        delta: { inserted: [], updated: [], deleted: [], mutations: [] },
        resolution,
      };
      const props = {
        db,
        frontend: main,
        models: mainModels,
        aggregateId: 'acct_1',
        userId: 'usr_1',
        sessionId: session.sessionId,
        command: output,
      };
      expect(yield* applyAggregateFrontendCommand(props)).toBe('applied');
      expect(
        db
          .select()
          .from(List.drizzleSchema)
          .all()
          .map(row => row.id),
      ).toEqual(['lst_second']);
      expect(
        db.select().from(sessionOptimisticAppliedMutationDrizzleSchema).all(),
      ).toHaveLength(1);
      expect(yield* applyAggregateFrontendCommand(props)).toBe('duplicate');
      const gap = yield* applyAggregateFrontendCommand({
        ...props,
        command: {
          userIndex: 3,
          aggregateIndex: 1,
          delta: output.delta,
          resolution: null,
        },
      }).pipe(Effect.result);
      expect(gap).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'aggregate-frontend-command-index-gap' },
      });
      expect(
        db.select().from(sessionMetadataDrizzleSchema).get()?.aggregateIndex,
      ).toBe(1);
      expect(
        yield* applyAggregateFrontendCommand({
          ...props,
          command: {
            userIndex: 2,
            aggregateIndex: 1,
            delta: output.delta,
            resolution: null,
          },
        }),
      ).toBe('applied');
      expect(
        db
          .select()
          .from(List.drizzleSchema)
          .all()
          .map(row => row.id),
      ).toEqual(['lst_second']);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          AsyncLive,
          IncrementalMonotonicFactory,
          makePrefixedIncrementalIdFactory('resolution'),
        ),
      ),
    ),
  );
});
