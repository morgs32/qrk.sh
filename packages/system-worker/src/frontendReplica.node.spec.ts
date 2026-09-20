import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { List, main, mainModels, User } from '@zerospin/core/fixtures/system';
import { initializeGuards as initializeFrontendGuards } from '@zerospin/core/frontendController/initializeGuards';
import { applyAggregateSelectedCommand } from '@zerospin/core/session/applyAggregateSelectedCommand';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import { stageCommand } from '@zerospin/core/session/stageCommand';
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
import { Effect, Exit, Layer, ManagedRuntime, Scope } from 'effect';
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
        Effect.map(initializeFrontendGuards({ frontend: main }), guards =>
          {
            const session = makeAggregateSession({ frontend: main });
            session.setExecutionResources({
              guards,
              sessionId: 'sesn_resolution',
              runtime: guardTestRuntime,
              executeAggregateFrontendCommand: ({ command }) =>
              Effect.succeed({ commandId: command.id }),
            });
            return session;
          },
        ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
      );
      session.store.setState({
        sessionId: 'sesn_resolution',
        aggregateId: 'acct_1',
        aggregateName: main.aggregateName,
        authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
        frontendName: main.name,
        aggregateFrontendLockKey: 'lock',
        db,
        schema: dbConfig.schema,
        models: mainModels,
        isInitialized: true,
        aggregateIndex: 0,
        selectionIndex: 0,
                  selectionHash: 'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
        pushIndex: 0,
        sessionStatus: 'current',
        backupState: { status: 'ready', failure: null },
      });
      const first = yield* decodeRpc(
        stageCommand({ session: session,
          contractName: 'createList',
          payload: { id: 'lst_first', name: 'First', userId: 'usr_1' },
        }),
      );
      yield* decodeRpc(
        stageCommand({ session: session,
          contractName: 'createList',
          payload: { id: 'lst_second', name: 'Second', userId: 'usr_1' },
        }),
      );
      expect(db.select().from(List.drizzleSchema).all()).toHaveLength(2);
      const output = {
        id: first.id,
        selectionIndex: 1,
        selectionHash:
          'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
        aggregateIndex: 1,
        delta: { upserted: [], deleted: [] },
        failure: {
          code: 'rejected',
          message: 'Rejected',
          cause: null,
          extra: null,
          status: null,
        },
      };
      const props = {
        db,
        frontend: main,
        models: mainModels,
        sessionId: session.sessionId,
        command: output,
      };
      expect(yield* applyAggregateSelectedCommand(props)).toBe('applied');
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
      expect(yield* applyAggregateSelectedCommand(props)).toBe('duplicate');
      const gap = yield* applyAggregateSelectedCommand({
        ...props,
        command: {
          id: 'cmd_gap',
          selectionIndex: 3,
          selectionHash:
            'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
          aggregateIndex: 1,
          delta: output.delta,
          failure: null,
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
        yield* applyAggregateSelectedCommand({
          ...props,
          command: {
            id: 'cmd_other',
            selectionIndex: 2,
            selectionHash:
              'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
            aggregateIndex: 1,
            delta: output.delta,
            failure: null,
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
          makePrefixedIncrementalIdFactory('selected-command'),
        ),
      ),
    ),
  );
});
