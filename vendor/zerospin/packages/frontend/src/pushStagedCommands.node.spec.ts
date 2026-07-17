import { it } from '@effect/vitest';

// The non-React frontend package owns this transport and reconciliation program.
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
import { main, mainModels } from '@zerospin/core/fixtures/system';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { makeSession } from '@zerospin/core/session/makeSession';
import {
  sessionFailedCommandDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import type { ISessionId } from '@zerospin/core/session/types';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import { Effect, Layer, Redacted } from 'effect';
import { TestContext } from 'effect/TestContext';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import { pushStagedCommands } from './pushStagedCommands';

const newHttpBatchRpcSessionMock = vi.hoisted(() => vi.fn());
const getFrontendApi = vi.hoisted(() => vi.fn());
const pushCommands = vi.hoisted(() => vi.fn());

vi.mock('@zerospin/core/utils/newSyncRpcSession', () => ({
  newSyncRpcSession: newHttpBatchRpcSessionMock,
}));

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('pushStagedCommands'),
  IncrementalMonotonicFactory,
  Layer.succeed(ZerospinApisUrl, 'https://api.example.com/'),
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  AsyncLive,
  makeTelemetryLayer(makeTelemetryCollector()),
  TestContext,
);

describe('pushStagedCommands', () => {
  beforeEach(() => {
    getFrontendApi.mockReturnValue({ pushCommands });
    newHttpBatchRpcSessionMock.mockReturnValue({
      getFrontendApi,
      [Symbol.dispose]: () => {},
    });
    pushCommands.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.layer(TestLayer)(it => {
    it.effect('rebases pending, pushed, and failed response partitions', () =>
      Effect.gen(function* () {
        const models = mainModels;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoTables,
        });
        const { schema } = dbConfig;
        const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

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
          generationId: 'gen_1',
          systemVersion: '1.0.0',
          systemWorkerName: 'stub-deploy',
          db,
          schema,
          models,
          vfsName: null,
          isInitialized: true,
          frontendIndex: null,
          lastRebasedPushedCursor: null,
        });

        yield* Effect.promise(() =>
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_1',
              name: 'List 1',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));
        yield* Effect.promise(() =>
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_2',
              name: 'List 2',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));
        yield* Effect.promise(() =>
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_3',
              name: 'List 3',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));

        const encodedStagedRows = db
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .orderBy(sessionStagedCommandDrizzleSchema.stagedCursor)
          .all();
        const first = encodedStagedRows[0];
        const second = encodedStagedRows[1];
        const third = encodedStagedRows[2];
        if (
          first === undefined ||
          second === undefined ||
          third === undefined
        ) {
          throw new Error('Expected three encoded staged commands');
        }

        const now = new Date('2026-01-01T00:00:00.000Z');
        const admissionResponse = {
          pendingCommands: [
            {
              ...first,
              status: 'pushed',
              pushedAt: now,
              pushedCursor: 'pcur_1',
            },
          ],
          pushedCommands: [
            {
              ...second,
              status: 'pushed',
              pushedAt: now,
              pushedCursor: 'pcur_2',
            },
          ],
          failedCommands: [
            {
              ...third,
              status: 'failed',
              failedAt: now,
              failure: 'frontend rejected command',
            },
          ],
        };
        pushCommands.mockImplementation(async () => ({
          result: encodeRight(admissionResponse),
          link: null,
        }));

        const result = yield* pushStagedCommands({ session });

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
        const optimisticRows = db
          .select()
          .from(sessionOptimisticAppliedMutationDrizzleSchema)
          .all();
        const listRows = db.select().from(models.list.drizzleSchema).all();

        expect(stagedRows).toHaveLength(0);
        expect(pushedRows).toHaveLength(2);
        expect(failedRows).toEqual([
          expect.objectContaining({
            id: third.id,
            failure: 'frontend rejected command',
          }),
        ]);
        expect(optimisticRows).toHaveLength(2);
        expect(listRows.find(row => row.id === 'lst_1')).toBeDefined();
        expect(listRows.find(row => row.id === 'lst_2')).toBeDefined();
        expect(listRows.find(row => row.id === 'lst_3')).toBeUndefined();
        expect(pushCommands).toHaveBeenCalledTimes(1);
        expect(result).toEqual(admissionResponse);
      }),
    );

    it.effect('returns an empty response without opening an RPC session', () =>
      Effect.gen(function* () {
        const models = mainModels;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoTables,
        });
        const { schema } = dbConfig;
        const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

        const sessionId = 'sesn_empty';
        const generateSignature = vi.fn(() =>
          Effect.succeed({ actorId: 'usr_1' }),
        );
        const session = makeSession({
          frontend: main,
          generateSignature,
          sessionId,
        });
        session.store.setState({
          sessionId,
          accountId: 'acct_1',
          accountName: main.accountName,
          actorId: 'usr_1',
          generationId: 'gen_1',
          systemVersion: '1.0.0',
          systemWorkerName: 'stub-deploy',
          db,
          schema,
          models,
          vfsName: null,
          isInitialized: true,
          frontendIndex: null,
          lastRebasedPushedCursor: null,
        });

        const result = yield* pushStagedCommands({ session });

        expect(result).toEqual({
          pendingCommands: [],
          pushedCommands: [],
          failedCommands: [],
        });
        expect(generateSignature).not.toHaveBeenCalled();
        expect(newHttpBatchRpcSessionMock).not.toHaveBeenCalled();
        expect(pushCommands).not.toHaveBeenCalled();
      }),
    );

    it.effect('fails without rebasing when the push request fails', () =>
      Effect.gen(function* () {
        const models = mainModels;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoTables,
        });
        const { schema } = dbConfig;
        const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

        const sessionId = 'sesn_request_failure';
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
          generationId: 'gen_1',
          systemVersion: '1.0.0',
          systemWorkerName: 'stub-deploy',
          db,
          schema,
          models,
          vfsName: null,
          isInitialized: true,
          frontendIndex: null,
          lastRebasedPushedCursor: null,
        });

        yield* Effect.promise(() =>
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_request_failure',
              name: 'Request failure',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));

        pushCommands.mockRejectedValue(new Error('network unavailable'));

        const result = yield* pushStagedCommands({ session }).pipe(
          Effect.either,
        );

        const stagedRows = db
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .all();
        const pushedRows = db
          .select()
          .from(sessionPushedCommandDrizzleSchema)
          .all();

        expect(result._tag).toBe('Left');
        expect(stagedRows).toHaveLength(1);
        expect(pushedRows).toHaveLength(0);
      }),
    );

    it.effect('fails instead of returning when local rebasing fails', () =>
      Effect.gen(function* () {
        const models = mainModels;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoTables,
        });
        const { schema } = dbConfig;
        const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

        const sessionId = 'sesn_rebase_failure';
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
          generationId: 'gen_1',
          systemVersion: '1.0.0',
          systemWorkerName: 'stub-deploy',
          db,
          schema,
          models,
          vfsName: null,
          isInitialized: true,
          frontendIndex: null,
          lastRebasedPushedCursor: null,
        });

        yield* Effect.promise(() =>
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_rebase_failure',
              name: 'Rebase failure',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));

        const stagedCommand = db
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .get();
        if (stagedCommand === undefined) {
          throw new Error('Expected one staged command');
        }

        db.update(sessionOptimisticAppliedMutationDrizzleSchema)
          .set({ mutations: 'not encoded mutation JSON' })
          .run();

        const now = new Date('2026-01-01T00:00:00.000Z');
        pushCommands.mockImplementation(async () => ({
          result: encodeRight({
            pendingCommands: [],
            pushedCommands: [
              {
                ...stagedCommand,
                status: 'pushed',
                pushedAt: now,
                pushedCursor: 'pcur_rebase_failure',
              },
            ],
            failedCommands: [],
          }),
          link: null,
        }));

        const result = yield* pushStagedCommands({ session }).pipe(
          Effect.either,
        );

        const stagedRows = db
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .all();
        const pushedRows = db
          .select()
          .from(sessionPushedCommandDrizzleSchema)
          .all();

        expect(result._tag).toBe('Left');
        expect(stagedRows).toHaveLength(1);
        expect(pushedRows).toHaveLength(0);
      }),
    );

    it.effect('replays a command staged while pushCommands is in flight', () =>
      Effect.gen(function* () {
        const models = mainModels;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoTables,
        });
        const { schema } = dbConfig;
        const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

        const sessionId = 'sesn_in_flight';
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
          generationId: 'gen_1',
          systemVersion: '1.0.0',
          systemWorkerName: 'stub-deploy',
          db,
          schema,
          models,
          vfsName: null,
          isInitialized: true,
          frontendIndex: null,
          lastRebasedPushedCursor: null,
        });

        yield* Effect.promise(() =>
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_before_push',
              name: 'Before push',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));

        const now = new Date('2026-01-01T00:00:00.000Z');
        pushCommands.mockImplementation(
          async request => {
            await session.stageCommand({
              contractName: 'createList',
              payload: {
                id: 'lst_during_push',
                name: 'During push',
                userId: 'usr_1',
              },
            });
            const pushProps = request.args[0];
            if (pushProps === undefined) {
              throw new Error('Expected pushCommands props');
            }
            const command = pushProps.commands[0];
            if (command === undefined) {
              throw new Error('Expected the command captured for push');
            }
            return {
              result: encodeRight({
                pendingCommands: [],
                pushedCommands: [
                  {
                    ...command,
                    status: 'pushed',
                    pushedAt: now,
                    pushedCursor: 'pcur_in_flight',
                  },
                ],
                failedCommands: [],
              }),
              link: null,
            };
          },
        );

        yield* pushStagedCommands({ session });

        const stagedRows = db
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .all();
        const pushedRows = db
          .select()
          .from(sessionPushedCommandDrizzleSchema)
          .all();
        const optimisticRows = db
          .select()
          .from(sessionOptimisticAppliedMutationDrizzleSchema)
          .all();
        const listRows = db.select().from(models.list.drizzleSchema).all();

        expect(stagedRows).toHaveLength(1);
        expect(pushedRows).toHaveLength(1);
        expect(optimisticRows).toHaveLength(2);
        expect(
          listRows.find(row => row.id === 'lst_before_push'),
        ).toBeDefined();
        expect(
          listRows.find(row => row.id === 'lst_during_push'),
        ).toBeDefined();
      }),
    );
  });
});
