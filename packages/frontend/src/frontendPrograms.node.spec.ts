import type { IBackupWorker } from '@zerospin/backup-worker';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { main as authenticationFixtureFrontend } from '@zerospin/core/fixtures/system';
import { initializeGuards as initializeFrontendGuards } from '@zerospin/core/frontendController/initializeGuards';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { ZerospinError } from '@zerospin/error';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  TelemetryCollector,
} from '@zerospin/logger';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import {
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Result,
  Schema,
  Scope,
} from 'effect';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { bootstrapAggregateFrontendSession } from './bootstrapAggregateFrontendSession';
import { bootstrapServiceFrontendSession } from './bootstrapServiceFrontendSession';
import { createAggregateFrontendWebSocketTicket } from './createAggregateFrontendWebSocketTicket';
import { fetchAggregateFrontendSnapshot } from './fetchAggregateFrontendSnapshot';
const guardTestRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);
const sessionScope = Scope.makeUnsafe();
Effect.runSync(
  Scope.addFinalizer(sessionScope, guardTestRuntime.disposeEffect),
);
afterAll(() => Effect.runPromise(Scope.close(sessionScope, Exit.void)));

const getSnapshotLeaf = vi.hoisted(() => vi.fn());
const createWebSocketTicketLeaf = vi.hoisted(() => vi.fn());
const authorizeAggregateLeaf = vi.hoisted(() => vi.fn());
const disposeGatewayLeaf = vi.hoisted(() => vi.fn());
const newSyncRpcSessionLeaf = vi.hoisted(() => vi.fn());

const mockFrontendApi = {
  getSnapshot: getSnapshotLeaf,
  createWebSocketTicket: createWebSocketTicketLeaf,
};

vi.mock('@zerospin/core/utils/newSyncRpcSession', () => ({
  newSyncRpcSession: newSyncRpcSessionLeaf,
}));

const aggregateFrontendLock = {
  systemName: 'shopping',
  frontendName: 'web',
  authentication: {
    authenticationJsonSchema: {},
  },
  models: {},
  contracts: {},
};
const aggregateId = Schema.decodeUnknownSync(makeAbbreviationIdSchema('acct'))(
  'acct_1',
);
const generateSignature = vi.fn();
const TestLayer = Layer.merge(
  AsyncLive,
  makeTelemetryLayer(makeTelemetryCollector()),
);

describe('@zerospin/frontend programs', () => {
  beforeEach(() => {
    getSnapshotLeaf.mockReset();
    createWebSocketTicketLeaf.mockReset();
    authorizeAggregateLeaf.mockReset();
    disposeGatewayLeaf.mockReset();
    newSyncRpcSessionLeaf.mockReset();
    generateSignature.mockReset();
    generateSignature.mockResolvedValue(encodeSuccess({ userId: 'user_1' }));
    authorizeAggregateLeaf.mockReturnValue(mockFrontendApi);
    newSyncRpcSessionLeaf.mockReturnValue({
      aggregate: () => ({
        authenticate: () => ({ authorize: authorizeAggregateLeaf }),
      }),
      [Symbol.dispose]: disposeGatewayLeaf,
    });
  });

  describe('createAggregateFrontendWebSocketTicket', () => {
    it('uses the admitted target for each fresh ticket request', async () => {
      createWebSocketTicketLeaf
        .mockResolvedValueOnce({
          result: encodeSuccess({ ticket: 'gen_1.raw-ticket-one' }),
          link: null,
        })
        .mockResolvedValueOnce({
          result: encodeSuccess({ ticket: 'gen_1.raw-ticket-two' }),
          link: null,
        });

      const first = await Effect.runPromise(
        createAggregateFrontendWebSocketTicket({
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemName: 'shopping',
          generateSignature,
          aggregateName: 'user',
          aggregateVersion: '1.0.0',
          frontendName: 'web',
          aggregateFrontendLock,
        }).pipe(Effect.provide(TestLayer)),
      );
      const second = await Effect.runPromise(
        createAggregateFrontendWebSocketTicket({
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemName: 'shopping',
          generateSignature,
          aggregateName: 'user',
          aggregateVersion: '1.0.0',
          frontendName: 'web',
          aggregateFrontendLock,
        }).pipe(Effect.provide(TestLayer)),
      );

      expect(first.ticket).toBe('gen_1.raw-ticket-one');
      expect(second.ticket).toBe('gen_1.raw-ticket-two');
      expect(createWebSocketTicketLeaf).toHaveBeenCalledTimes(2);
      expect(newSyncRpcSessionLeaf).toHaveBeenCalledTimes(2);
      expect(authorizeAggregateLeaf).toHaveBeenCalledTimes(2);
      expect(disposeGatewayLeaf).toHaveBeenCalledTimes(2);
    });

    it('preserves an encoded ticket failure without retrying', async () => {
      createWebSocketTicketLeaf.mockResolvedValueOnce({
        result: encodeFailure(
          new ZerospinError({
            code: 'aggregate-frontend-websocket-ticket-write-failed',
            message: 'Ticket storage failed',
          }),
        ),
        link: null,
      });

      const result = await Effect.runPromise(
        createAggregateFrontendWebSocketTicket({
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemName: 'shopping',
          generateSignature,
          aggregateName: 'user',
          aggregateVersion: '1.0.0',
          frontendName: 'web',
          aggregateFrontendLock,
        }).pipe(Effect.result, Effect.provide(TestLayer)),
      );

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure.code).toBe(
          'aggregate-frontend-websocket-ticket-write-failed',
        );
      }
      expect(createWebSocketTicketLeaf).toHaveBeenCalledOnce();
      expect(newSyncRpcSessionLeaf).toHaveBeenCalledOnce();
      expect(disposeGatewayLeaf).toHaveBeenCalledOnce();
    });
  });

  describe('fetchAggregateFrontendSnapshot', () => {
    it('wraps the concrete frontend target and returns a typed success', async () => {
      const state = {
        aggregateId: 'acct_1',
        authentication: { userId: 'user_1', aggregateId: 'acct_1' },
        aggregateName: 'user',
        frontendName: 'web',
        aggregateIndex: 0,
        selectionIndex: 7,
        selectionHash:
          'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
        aggregateVersion: '1.0.0',
        selectedCommands: [],
        resources: [],
      };
      getSnapshotLeaf.mockResolvedValueOnce({
        result: encodeSuccess(state),
        link: null,
      });

      const result = await Effect.runPromise(
        fetchAggregateFrontendSnapshot({
          aggregateVersion: '1.0.0',
          pendingCommandIds: ['cmd_pending'],
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemName: 'shopping',
          generateSignature,
          aggregateName: 'user',
          frontendName: 'web',
          aggregateFrontendLock,
        }).pipe(Effect.provide(TestLayer)),
      );

      expect(result).toEqual(state);
      expect(getSnapshotLeaf).toHaveBeenCalledWith(
        expect.objectContaining({
          args: [{ pendingCommandIds: ['cmd_pending'] }],
        }),
      );
      expect(newSyncRpcSessionLeaf).toHaveBeenCalledOnce();
      expect(disposeGatewayLeaf).toHaveBeenCalledOnce();
    });

    it('converts an encoded domain failure without retrying', async () => {
      getSnapshotLeaf.mockResolvedValueOnce({
        result: encodeFailure(
          new ZerospinError({
            code: 'aggregate-frontend-snapshot-domain-failure',
            message: 'Frontend snapshot lookup failed',
          }),
        ),
        link: null,
      });

      const result = await Effect.runPromise(
        fetchAggregateFrontendSnapshot({
          aggregateVersion: '1.0.0',
          pendingCommandIds: ['cmd_pending'],
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemName: 'shopping',
          generateSignature,
          aggregateName: 'user',
          frontendName: 'web',
          aggregateFrontendLock,
        }).pipe(Effect.result, Effect.provide(TestLayer)),
      );

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure.code).toBe(
          'aggregate-frontend-snapshot-domain-failure',
        );
      }
      expect(getSnapshotLeaf).toHaveBeenCalledOnce();
      expect(newSyncRpcSessionLeaf).toHaveBeenCalledOnce();
      expect(disposeGatewayLeaf).toHaveBeenCalledOnce();
    });
  });
});

describe('aggregate frontend snapshot and socket recovery', () => {
  it('resumes independent frontend positions and accepts duplicate buffered delivery across reconnect', async () => {
    const state = {
      aggregateId: 'acct_1',
      authentication: {
        userId: 'user_1',
        aggregateId: 'acct_1',
        issuedAt: new Date('2026-09-18T12:00:00Z'),
        level: 42,
      },
      aggregateName: 'user',
      aggregateVersion: '1.0.0',
      frontendName: 'web',
      aggregateIndex: 1,
      selectionIndex: 5,
      selectionHash:
        'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
      selectedCommands: [],
      resources: [],
    };
    getSnapshotLeaf.mockReset();
    createWebSocketTicketLeaf.mockReset();
    disposeGatewayLeaf.mockReset();
    newSyncRpcSessionLeaf.mockReturnValue({
      aggregate: () => ({
        authenticate: () => ({ authorize: () => mockFrontendApi }),
      }),
      [Symbol.dispose]: disposeGatewayLeaf,
    });
    generateSignature.mockResolvedValue(encodeSuccess({ userId: 'user_1' }));
    getSnapshotLeaf
      .mockResolvedValueOnce({ result: encodeSuccess(state), link: null })
      .mockResolvedValueOnce({ result: encodeSuccess(state), link: null })
      .mockResolvedValue({
        result: encodeSuccess({ ...state, selectionIndex: 8 }),
        link: null,
      });
    createWebSocketTicketLeaf.mockResolvedValue({
      result: encodeSuccess({ ticket: 'ticket' }),
      link: null,
    });

    const resumed: number[] = [];
    const sockets: Array<{ close(): void }> = [];
    class TestSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      closed = false;
      readyState = 1;
      constructor() {
        sockets.push(this);
        queueMicrotask(() => this.onopen?.());
      }
      send(bytes: string) {
        const message = JSON.parse(bytes);
        resumed.push(message.selectionIndex);
        const next = message.selectionIndex + 1;
        for (let duplicate = 0; duplicate < 2; duplicate++) {
          this.onmessage?.({
            data: JSON.stringify({
              type: 'aggregateSelectedCommand',
              command: {
                id: `cmd_selected_${next}`,
                selectionIndex: next,
                selectionHash:
                  'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
                aggregateIndex: 1,
                delta: {
                  upserted: [],
                  deleted: [],
                },
                failure: null,
              },
            }),
          });
        }
        this.onmessage?.({
          data: JSON.stringify({
            type: 'replay-complete',
            selectionIndex: next,
          }),
        });
      }
      close() {
        if (this.closed) return;
        this.closed = true;
        this.readyState = 3;
        this.onclose?.();
      }
    }
    const storage = new Map<string, string>();
    const events = new EventTarget();
    vi.stubGlobal('WebSocket', TestSocket);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
    vi.stubGlobal(
      'removeEventListener',
      events.removeEventListener.bind(events),
    );
    vi.stubGlobal(
      'document',
      Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    );
    const overwriteDb = vi.fn(() => Effect.void);
    const frontend = makeFrontendController({
      authenticationSchema: Schema.Struct({
        userId: Schema.String,
        aggregateId: Schema.String,
        issuedAt: Schema.DateFromString,
        level: Schema.NumberFromString,
      }),
      aggregateVersion: '1.0.0',
      systemName: 'shopping',
      aggregateName: 'user',
      name: 'web',
      models: {},
      contracts: {},
    });
    const session = Effect.runSync(
      Effect.map(initializeFrontendGuards({ frontend }), guards => {
        const session = makeAggregateSession({ frontend });
        session.setExecutionResources({
          sessionId: 'sesn_reconnect',
          guards,
          runtime: guardTestRuntime,
        });
        return session;
      }).pipe(Effect.provideService(Scope.Scope, sessionScope)),
    );
    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            yield* bootstrapAggregateFrontendSession({
              aggregateVersion: '1.0.0',
              session,
              apiUrl: 'https://api.example.test',
              publishableKey: 'pk_test',
              systemName: 'shopping',
              generateSignature,
              claimBackup: () =>
                Effect.succeed({
                  onDisconnect: () => () => {},
                  acquireDb: () =>
                    Effect.succeed({
                      status: 'acquired',
                      snapshot: null,
                      db: {
                        overwriteDb,
                        applyStatements: () => Effect.void,
                        exportSnapshot: () => Effect.succeed(null),
                        dispose: () => Effect.void,
                      },
                    }),
                }),
            });
            expect(session.store.getState()).toMatchObject({
              aggregateIndex: 1,
              selectionIndex: 6,
              selectionHash:
                'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
              sessionStatus: 'current',
            });
            const recovered = Promise.withResolvers<void>();
            const unsubscribe = session.store.subscribe(next => {
              if (next.selectionIndex === 7) recovered.resolve();
            });
            sockets[0]!.close();
            yield* Effect.tryPromise(() => recovered.promise).pipe(
              Effect.ensuring(Effect.sync(unsubscribe)),
            );
            expect(resumed).toEqual([5, 6]);
            expect(session.store.getState()).toMatchObject({
              aggregateIndex: 1,
              selectionIndex: 7,
              selectionHash:
                'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
              sessionStatus: 'current',
            });
            expect(session.store.getState().authentication).toEqual(
              state.authentication,
            );
            expect(overwriteDb).toHaveBeenCalledTimes(2);
          }),
        ).pipe(Effect.provide(TestLayer)),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it.each([
    'success',
    'transient',
    'pause-retry',
    'terminal',
    'close',
    'mismatch',
    'malformed',
    'null',
    'pause',
  ])(
    'serializes socket admission and preserves journal semantics: %s',
    async scenario => {
      const state = {
        aggregateId: 'acct_1',
        authentication: {
          userId: 'user_1',
          aggregateId: 'acct_1',
          issuedAt: new Date('2026-09-18T12:00:00Z'),
          level: 42,
        },
        aggregateName: 'user',
        aggregateVersion: '1.0.0',
        frontendName: 'web',
        aggregateIndex: 1,
        selectionIndex: 5,
        selectionHash:
          'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
        selectedCommands: [],
        resources: [],
      };
      getSnapshotLeaf.mockReset();
      createWebSocketTicketLeaf.mockReset();
      disposeGatewayLeaf.mockReset();
      newSyncRpcSessionLeaf.mockReturnValue({
        aggregate: () => ({
          authenticate: () => ({ authorize: () => mockFrontendApi }),
        }),
        [Symbol.dispose]: disposeGatewayLeaf,
      });
      generateSignature.mockResolvedValue(encodeSuccess({ userId: 'user_1' }));
      getSnapshotLeaf
        .mockResolvedValueOnce({ result: encodeSuccess(state), link: null })
        .mockResolvedValueOnce({ result: encodeSuccess(state), link: null })
        .mockResolvedValue({
          result: encodeSuccess({ ...state, selectionIndex: 8 }),
          link: null,
        });
      createWebSocketTicketLeaf.mockResolvedValue({
        result: encodeSuccess({ ticket: 'ticket' }),
        link: null,
      });

      const sent: Array<{
        socket: TestSocket;
        command: Record<string, unknown>;
      }> = [];
      const sockets: TestSocket[] = [];
      class TestSocket {
        onopen: (() => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        onerror: (() => void) | null = null;
        onclose: (() => void) | null = null;
        readyState = 1;
        resumed = false;
        constructor() {
          sockets.push(this);
          queueMicrotask(() => this.onopen?.());
        }
        send(bytes: string) {
          const message = JSON.parse(bytes);
          if (message.type === 'pushAggregateCommand') {
            expect(this.resumed).toBe(true);
            sent.push({ socket: this, command: message.command });
          } else {
            queueMicrotask(() => {
              this.resumed = true;
              this.onmessage?.({
                data: JSON.stringify({
                  type: 'replay-complete',
                  selectionIndex: message.selectionIndex,
                }),
              });
            });
          }
        }
        close() {
          if (this.readyState === 3) return;
          this.readyState = 3;
          this.onclose?.();
        }
      }
      const storage = new Map<string, string>();
      const events = new EventTarget();
      vi.stubGlobal('WebSocket', TestSocket);
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      });
      vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
      vi.stubGlobal(
        'removeEventListener',
        events.removeEventListener.bind(events),
      );
      vi.stubGlobal(
        'document',
        Object.assign(new EventTarget(), { visibilityState: 'visible' }),
      );
      const overwriteDb = vi.fn(() => Effect.void);
      const frontend = makeFrontendController({
        authenticationSchema: Schema.Struct({
          userId: Schema.String,
          aggregateId: Schema.String,
          issuedAt: Schema.DateFromString,
          level: Schema.NumberFromString,
        }),
        aggregateVersion: '1.0.0',
        systemName: 'shopping',
        aggregateName: 'user',
        name: 'web',
        models: {},
        contracts: {},
      });
      const session = Effect.runSync(
        Effect.map(initializeFrontendGuards({ frontend }), guards => {
          const session = makeAggregateSession({ frontend });
          session.setExecutionResources({
            sessionId: 'sesn_reconnect',
            guards,
            runtime: guardTestRuntime,
          });
          return session;
        }).pipe(Effect.provideService(Scope.Scope, sessionScope)),
      );
      try {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const controls = yield* bootstrapAggregateFrontendSession({
                aggregateVersion: '1.0.0',
                session,
                apiUrl: 'https://api.example.test',
                publishableKey: 'pk_test',
                systemName: 'shopping',
                generateSignature,
                claimBackup: () =>
                  Effect.succeed({
                    onDisconnect: () => () => {},
                    acquireDb: () =>
                      Effect.succeed({
                        status: 'acquired',
                        snapshot: null,
                        db: {
                          overwriteDb,
                          applyStatements: () => Effect.void,
                          exportSnapshot: () => Effect.succeed(null),
                          dispose: () => Effect.void,
                        },
                      }),
                  }),
              });
              yield* controls.setPushPaused({ pushPaused: true });
              const browserTelemetry = yield* TelemetryCollector;
              browserTelemetry.flush();
              const current = session.store.getState();
              if (!current.isInitialized) {
                throw new Error('Expected initialized session');
              }
              const commands = [1, 2].map(index => ({
                id: Schema.decodeUnknownSync(makeAbbreviationIdSchema('cmd'))(
                  `cmd_socket_${index}`,
                ),
                commandName: 'createList',
                payload: '{}',
                contractVersion: '1.0.0',
                systemName: 'shopping',
                aggregateId: 'acct_1',
                aggregateName: 'user',
                frontendName: 'web',
                authentication: {
                  userId: 'user_1',
                  aggregateId: 'acct_1',
                  issuedAt: '2026-09-18T12:00:00.000Z',
                  level: '42',
                },
                sessionId: current.sessionId,
                sessionIndex: index,
                pushIndex: null,
                chainedAt: '2026-09-20T01:02:03.000Z',
                delta: {
                  inserted: [],
                  updated: [],
                  deleted: [],
                  mutations: [],
                },
                failedAt: null,
                failure: null,
              }));
              for (const command of commands) {
                current.db
                  .insert(sessionCommandJournalDrizzleSchema)
                  .values({
                    id: command.id,
                    commandName: command.commandName,
                    payload: command.payload,
                    systemName: command.systemName,
                    contractVersion: command.contractVersion,
                    aggregateId: command.aggregateId,
                    aggregateName: command.aggregateName,
                    frontendName: command.frontendName,
                    authentication: JSON.stringify(command.authentication),
                    sessionId: command.sessionId,
                    sessionIndex: command.sessionIndex,
                    pushIndex: null,
                    command: JSON.stringify(command),
                  })
                  .run();
                current.db
                  .insert(sessionOptimisticAppliedMutationDrizzleSchema)
                  .values({ commandId: command.id, mutations: '[]' })
                  .run();
              }
              expect(sent).toEqual([]);
              yield* controls.setPushPaused({ pushPaused: false });
              yield* Effect.tryPromise(async () => {
                await vi.waitFor(() => expect(sent).toHaveLength(1));
                expect(sent[0]!.command).toEqual(commands[0]);
                const firstSocket = sent[0]!.socket;
                // Selected output continues while the admission Deferred is pending.
                firstSocket.onmessage?.({
                  data: JSON.stringify({
                    type: 'aggregateSelectedCommand',
                    command: {
                      id: 'cmd_unrelated',
                      selectionIndex: 6,
                      selectionHash: state.selectionHash,
                      aggregateIndex: 1,
                      delta: { upserted: [], deleted: [] },
                      failure: null,
                    },
                  }),
                });
                await vi.waitFor(() =>
                  expect(session.store.getState().selectionIndex).toBe(6),
                );
                expect(sent).toHaveLength(1);
                if (scenario === 'pause' || scenario === 'terminal') {
                  await Effect.runPromise(
                    controls.setPushPaused({ pushPaused: true }),
                  );
                }
                if (
                  scenario === 'close' ||
                  scenario === 'mismatch' ||
                  scenario === 'malformed' ||
                  scenario === 'null'
                ) {
                  if (scenario === 'close') {
                    firstSocket.close();
                  } else {
                    firstSocket.onmessage?.({
                      data:
                        scenario === 'null'
                          ? 'null'
                          : JSON.stringify({
                              type: 'aggregateCommandAdmission',
                              commandId: 'cmd_wrong',
                              result:
                                scenario === 'malformed'
                                  ? {}
                                  : encodeSuccess({
                                      commandId: 'cmd_wrong',
                                      aggregateIndex: 2,
                                    }),
                              link: null,
                            }),
                    });
                  }
                  await vi.waitFor(() => expect(sent).toHaveLength(2));
                  expect(sent[1]!.socket).not.toBe(firstSocket);
                  expect(sent[1]!.socket.resumed).toBe(true);
                  expect(sent[1]!.command).toEqual(commands[0]);
                } else if (
                  scenario === 'transient' ||
                  scenario === 'pause-retry' ||
                  scenario === 'terminal'
                ) {
                  firstSocket.onmessage?.({
                    data: JSON.stringify({
                      type: 'aggregateCommandAdmission',
                      commandId: commands[0]!.id,
                      result: encodeFailure(
                        new ZerospinError({
                          code:
                            scenario === 'transient' ||
                            scenario === 'pause-retry'
                              ? 'async-failed'
                              : 'aggregate-frontend-command-contract-unavailable',
                          message: 'rejected',
                          cause: null,
                          extra: null,
                          status: null,
                        }),
                      ),
                      link: null,
                    }),
                  });
                  if (scenario === 'transient' || scenario === 'pause-retry') {
                    if (scenario === 'pause-retry') {
                      await new Promise(resolve => setTimeout(resolve, 20));
                      await Effect.runPromise(
                        controls.setPushPaused({ pushPaused: true }),
                      );
                      await new Promise(resolve => setTimeout(resolve, 300));
                      expect(sent).toHaveLength(1);
                      await Effect.runPromise(
                        controls.setPushPaused({ pushPaused: false }),
                      );
                    }
                    await vi.waitFor(() => expect(sent).toHaveLength(2));
                    expect(sent[1]!.command).toEqual(commands[0]);
                  } else {
                    await new Promise(resolve => setTimeout(resolve, 20));
                    expect(sent).toHaveLength(1);
                    const pushed = Effect.runPromise(controls.pushNow);
                    await vi.waitFor(() => expect(sent).toHaveLength(2));
                    firstSocket.onmessage?.({
                      data: JSON.stringify({
                        type: 'aggregateCommandAdmission',
                        commandId: commands[0]!.id,
                        result: encodeFailure(
                          new ZerospinError({
                            code: 'aggregate-frontend-command-contract-unavailable',
                            message: 'rejected',
                            cause: null,
                            extra: null,
                            status: null,
                          }),
                        ),
                        link: null,
                      }),
                    });
                    expect(await pushed).toMatchObject({
                      status: 'retry-exhausted',
                      failure: {
                        code: 'aggregate-frontend-command-contract-unavailable',
                      },
                    });
                    expect(
                      current.db
                        .select()
                        .from(sessionCommandJournalDrizzleSchema)
                        .all()
                        .find(row => row.id === commands[0]!.id)?.pushIndex,
                    ).toBeNull();
                    return;
                  }
                }
                const count = sent.length;
                sent.at(-1)!.socket.onmessage?.({
                  data: JSON.stringify({
                    type: 'aggregateCommandAdmission',
                    commandId: commands[0]!.id,
                    result: encodeSuccess({
                      commandId: commands[0]!.id,
                      aggregateIndex: 2,
                    }),
                    link: {
                      linkId: 'lnk_socket',
                      traceId: 'trc_server',
                      spanId: 'spn_server',
                      priorTraceId: 'trc_browser',
                      priorSpanId: 'spn_browser',
                      kind: 'causedBy',
                    },
                  }),
                });
                await vi.waitFor(() =>
                  expect(
                    current.db
                      .select()
                      .from(sessionCommandJournalDrizzleSchema)
                      .all()
                      .find(row => row.id === commands[0]!.id)?.pushIndex,
                  ).toBe(2),
                );
                expect(browserTelemetry.flush().links).toContainEqual(
                  expect.objectContaining({
                    linkId: 'lnk_socket',
                    kind: 'causedBy',
                  }),
                );
                expect(
                  current.db
                    .select()
                    .from(sessionOptimisticAppliedMutationDrizzleSchema)
                    .all(),
                ).toHaveLength(2);
                if (scenario === 'pause') {
                  expect(sent).toHaveLength(count);
                  await Effect.runPromise(
                    controls.setPushPaused({ pushPaused: false }),
                  );
                }
                await vi.waitFor(() => expect(sent).toHaveLength(count + 1));
                expect(sent.at(-1)!.command).toEqual(commands[1]);
                sent.at(-1)!.socket.onmessage?.({
                  data: JSON.stringify({
                    type: 'aggregateCommandAdmission',
                    commandId: commands[1]!.id,
                    result: encodeSuccess({
                      commandId: commands[1]!.id,
                      aggregateIndex: 3,
                    }),
                    link: null,
                  }),
                });
                await vi.waitFor(() =>
                  expect(
                    current.db
                      .select()
                      .from(sessionCommandJournalDrizzleSchema)
                      .all()
                      .find(row => row.id === commands[1]!.id)?.pushIndex,
                  ).toBe(3),
                );
              });
            }),
          ).pipe(Effect.provide(TestLayer)),
        );
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
});

describe('frontend startup without a reusable backup', () => {
  it.each(['aggregate', 'service'])(
    'preserves the %s command stream connection failure',
    async kind => {
      getSnapshotLeaf.mockReset();
      createWebSocketTicketLeaf.mockReset();
      newSyncRpcSessionLeaf.mockReturnValue({
        aggregate: () => ({
          authenticate: () => ({ authorize: () => mockFrontendApi }),
        }),
        service: () => ({
          authenticate: () => ({ authorize: () => mockFrontendApi }),
        }),
        [Symbol.dispose]: disposeGatewayLeaf,
      });
      generateSignature.mockResolvedValue(encodeSuccess({ userId: 'user_1' }));
      getSnapshotLeaf.mockResolvedValue({
        result: encodeSuccess({
          authentication: { userId: 'user_1', aggregateId: 'acct_1' },
          frontendName: 'web',
          resources: [],
          ...(kind === 'aggregate'
            ? {
                aggregateId,
                aggregateName: 'user',
                aggregateVersion: '1.0.0',
                aggregateIndex: 0,
                selectionIndex: 0,
                selectionHash:
                  'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
                selectedCommands: [],
              }
            : {
                serviceName: 'catalog',
                serviceVersion: '1.0.0',
                serviceIndex: 0,
                serviceHash:
                  'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
              }),
        }),
        link: null,
      });
      createWebSocketTicketLeaf.mockResolvedValue({
        result: encodeSuccess({ ticket: 'ticket' }),
        link: null,
      });

      vi.stubGlobal(
        'WebSocket',
        class {
          onerror: (() => void) | null = null;
          constructor() {
            queueMicrotask(() => this.onerror?.());
          }
          close = vi.fn();
        },
      );
      const storage = new Map<string, string>();
      const events = new EventTarget();
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      });
      vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
      vi.stubGlobal(
        'removeEventListener',
        events.removeEventListener.bind(events),
      );
      vi.stubGlobal(
        'document',
        Object.assign(new EventTarget(), { visibilityState: 'visible' }),
      );
      const overwriteDb = vi.fn(() => Effect.void);
      const backupWorker: IBackupWorker = {
        onDisconnect: () => () => {},
        acquireDb: () =>
          Effect.succeed({
            status: 'acquired',
            snapshot: null,
            db: {
              overwriteDb,
              applyStatements: () => Effect.void,
              exportSnapshot: () => Effect.succeed(null),
              dispose: () => Effect.void,
            },
          }),
      };
      const props = {
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        systemName: 'shopping',
        generateSignature,
        claimBackup: () => Effect.succeed(backupWorker),
      };
      try {
        const result = await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              if (kind === 'aggregate') {
                const frontend = makeFrontendController({
                  authenticationSchema:
                    authenticationFixtureFrontend.authentication
                      .authenticationSchema,
                  aggregateVersion: '1.0.0',
                  systemName: 'shopping',
                  aggregateName: 'user',
                  name: 'web',
                  models: {},
                  contracts: {},
                });
                const guards = yield* initializeFrontendGuards({
                  frontend,
                });
                return yield* bootstrapAggregateFrontendSession({
                  ...props,
                  aggregateVersion: '1.0.0',
                  session: (() => {
                    const __session = makeAggregateSession({
                      frontend,
                    });
                    __session.setExecutionResources({
                      sessionId: 'sesn_connection_failure',
                      guards,
                      runtime: guardTestRuntime,
                    });
                    return __session;
                  })(),
                });
              }
              const frontend = makeFrontendController({
                authenticationSchema:
                  authenticationFixtureFrontend.authentication
                    .authenticationSchema,
                serviceVersion: '1.0.0',
                systemName: 'shopping',
                serviceName: 'catalog',
                name: 'web',
                models: {},
              });
              return yield* bootstrapServiceFrontendSession({
                ...props,
                serviceVersion: '1.0.0',
                session: (() => {
                  const __session = makeServiceSession({
                    frontend,
                    models: frontend.models,
                  });
                  __session.setSessionId('sesn_connection_failure');
                  return __session;
                })(),
              });
            }),
          ).pipe(Effect.result, Effect.provide(TestLayer)),
        );

        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) {
          expect(result.failure.code).toBe(
            `${kind}-frontend-websocket-open-failed`,
          );
          expect(result.failure.rawMessage).toBe(
            `Could not connect to the ${kind} frontend command stream`,
          );
          expect(result.failure.cause).toContain('WebSocket open failed');
        }
        expect(createWebSocketTicketLeaf).toHaveBeenCalledOnce();
        // Cold-start replacement persists the authoritative baseline before resume.
        expect(overwriteDb).toHaveBeenCalledOnce();
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
});

it.each(['aggregate', 'service'])(
  'encodes transformed %s claims before hashing and reopens decoded SQLite claims offline',
  async kind => {
    const authenticationSchema = Schema.Struct({
      aggregateId: Schema.String,
      issuedAt: Schema.DateFromString,
      level: Schema.NumberFromString,
    });
    const authentication = {
      aggregateId: 'acct_1',
      issuedAt: new Date('2026-09-18T12:00:00.000Z'),
      level: 42,
    };
    const state = {
      authentication,
      frontendName: 'web',
      resources: [],
      ...(kind === 'aggregate'
        ? {
            aggregateId,
            aggregateName: 'user',
            aggregateVersion: '1.0.0',
            aggregateIndex: 0,
            selectionIndex: 0,
            selectionHash:
              'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
            selectedCommands: [],
          }
        : {
            serviceName: 'catalog',
            serviceVersion: '1.0.0',
            serviceIndex: 0,
            serviceHash:
              'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
          }),
    };
    getSnapshotLeaf.mockReset();
    getSnapshotLeaf.mockResolvedValue({
      result: encodeSuccess(state),
      link: null,
    });
    createWebSocketTicketLeaf.mockResolvedValue({
      result: encodeSuccess({ ticket: 'ticket' }),
      link: null,
    });
    newSyncRpcSessionLeaf.mockReturnValue({
      aggregate: () => ({
        authenticate: () => ({ authorize: () => mockFrontendApi }),
      }),
      service: () => ({
        authenticate: () => ({ authorize: () => mockFrontendApi }),
      }),
      [Symbol.dispose]: disposeGatewayLeaf,
    });
    generateSignature.mockResolvedValue(encodeSuccess({}));
    const storage = new Map<string, string>();
    const events = new EventTarget();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
    vi.stubGlobal(
      'removeEventListener',
      events.removeEventListener.bind(events),
    );
    vi.stubGlobal(
      'document',
      Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    );
    vi.stubGlobal(
      'WebSocket',
      class {
        readyState = 1;
        onopen: (() => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        constructor() {
          queueMicrotask(() => this.onopen?.());
        }
        send() {
          queueMicrotask(() =>
            this.onmessage?.({
              data: JSON.stringify({
                type: 'replay-complete',
                ...(kind === 'aggregate'
                  ? { selectionIndex: 0 }
                  : { serviceIndex: 0 }),
              }),
            }),
          );
        }
        close() {
          this.onopen = null;
          this.onmessage = null;
        }
      },
    );
    let snapshot: Uint8Array | null = null;
    const keys: string[] = [];
    const backupWorker: IBackupWorker = {
      onDisconnect: () => () => {},
      acquireDb: ({ backupKey }) =>
        Effect.sync(() => {
          keys.push(backupKey);
          return {
            status: 'acquired',
            snapshot,
            db: {
              overwriteDb: props =>
                Effect.sync(() => {
                  snapshot = props.snapshot.slice();
                }),
              applyStatements: () => Effect.void,
              exportSnapshot: () => Effect.succeed(snapshot),
              dispose: () => Effect.void,
            },
          };
        }),
    };
    const boot = () =>
      Effect.scoped(
        Effect.gen(function* () {
          const props = {
            apiUrl: 'https://claims.test',
            publishableKey: 'pk_test',
            systemName: 'shopping',
            generateSignature,
            claimBackup: () => Effect.succeed(backupWorker),
          };
          if (kind === 'aggregate') {
            const frontend = makeFrontendController({
              systemName: 'shopping',
              aggregateName: 'user',
              aggregateVersion: '1.0.0',
              name: 'web',
              models: {},
              contracts: {},
              authenticationSchema,
            });
            const guards = yield* initializeFrontendGuards({
              frontend,
            });
            const session = makeAggregateSession({ frontend });
            session.setExecutionResources({
              sessionId: 'sesn_dates082',
              guards,
              runtime: guardTestRuntime,
            });
            const result = yield* bootstrapAggregateFrontendSession({
              ...props,
              aggregateVersion: '1.0.0',
              session,
            }).pipe(
              Effect.onError(() =>
                Effect.sync(() =>
                  expect(session.store.getState().isInitialized).toBe(false),
                ),
              ),
            );
            expect(session.store.getState().authentication).toEqual(
              authentication,
            );
            return result.authentication;
          }
          const frontend = makeFrontendController({
            systemName: 'shopping',
            serviceName: 'catalog',
            serviceVersion: '1.0.0',
            name: 'web',
            models: {},
            authenticationSchema,
          });
          const session = makeServiceSession({
            frontend,
            models: frontend.models,
          });
          session.setSessionId('sesn_dates082');
          const result = yield* bootstrapServiceFrontendSession({
            ...props,
            serviceVersion: '1.0.0',
            session,
          }).pipe(
            Effect.onError(() =>
              Effect.sync(() =>
                expect(session.store.getState().isInitialized).toBe(false),
              ),
            ),
          );
          expect(session.store.getState().authentication).toEqual(
            authentication,
          );
          return result.authentication;
        }),
      ).pipe(Effect.provide(TestLayer));
    try {
      expect(await Effect.runPromise(boot())).toEqual(authentication);
      expect(snapshot).not.toBeNull();
      const encoded = Schema.encodeSync(authenticationSchema)(authentication);
      const canonical = JSON.stringify(encoded, Object.keys(encoded).sort());
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(canonical),
          ),
        ),
        byte => byte.toString(16).padStart(2, '0'),
      ).join('');
      expect(keys[0]).toContain(hash);
      getSnapshotLeaf.mockResolvedValue({
        result: encodeFailure(new ZerospinError({ code: 'async-failed' })),
        link: null,
      });
      expect(await Effect.runPromise(boot())).toEqual(authentication);
      expect(keys[1]).toBe(keys[0]);
      if (snapshot === null) throw new Error('Missing SQLite backup');
      const intact: Uint8Array = snapshot;
      const needle = new TextEncoder().encode('"level":"42"');
      const offset = intact.findIndex((_, index) =>
        needle.every((byte, n) => intact[index + n] === byte),
      );
      expect(offset).toBeGreaterThanOrEqual(0);
      for (const replacement of ['43', 'xx']) {
        snapshot = intact.slice();
        snapshot.set(new TextEncoder().encode(replacement), offset + 9);
        await expect(Effect.runPromise(boot())).rejects.toMatchObject({
          code: 'browser-persistence-reset-required',
        });
      }
    } finally {
      vi.unstubAllGlobals();
    }
  },
);
