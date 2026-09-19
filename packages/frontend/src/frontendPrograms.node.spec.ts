import type { IBackupWorker } from '@zerospin/backup-worker';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { main as authenticationFixtureFrontend } from '@zerospin/core/fixtures/system';
import { initializeGuards as initializeFrontendGuards } from '@zerospin/core/frontendController/initializeGuards';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { ZerospinError } from '@zerospin/error';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
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
import { fetchAggregateFrontendState } from './fetchAggregateFrontendState';
const guardTestRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

const sessionScope = Scope.makeUnsafe();
Effect.runSync(
  Scope.addFinalizer(sessionScope, guardTestRuntime.disposeEffect),
);
afterAll(() => Effect.runPromise(Scope.close(sessionScope, Exit.void)));

const getStateLeaf = vi.hoisted(() => vi.fn());
const createWebSocketTicketLeaf = vi.hoisted(() => vi.fn());
const authorizeAggregateLeaf = vi.hoisted(() => vi.fn());
const disposeGatewayLeaf = vi.hoisted(() => vi.fn());
const newSyncRpcSessionLeaf = vi.hoisted(() => vi.fn());

const mockFrontendApi = {
  getState: getStateLeaf,
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
const systemId = Schema.decodeUnknownSync(makeAbbreviationIdSchema('sys'))(
  'sys_1',
);
const generateSignature = vi.fn();
const TestLayer = Layer.merge(
  AsyncLive,
  makeTelemetryLayer(makeTelemetryCollector()),
);

describe('@zerospin/frontend programs', () => {
  beforeEach(() => {
    getStateLeaf.mockReset();
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

  describe('fetchAggregateFrontendState', () => {
    it('wraps the concrete frontend target and returns a typed success', async () => {
      const state = {
        aggregateId: 'acct_1',
        authentication: { userId: 'user_1', aggregateId: 'acct_1' },
        systemId,
        aggregateName: 'user',
        frontendName: 'web',
        aggregateIndex: 0,
        userIndex: 7,
        aggregateVersion: '1.0.0',
        resolutions: [],
        resources: [],
      };
      getStateLeaf.mockResolvedValueOnce({
        result: encodeSuccess(state),
        link: null,
      });

      const result = await Effect.runPromise(
        fetchAggregateFrontendState({
          aggregateVersion: '1.0.0',
          outstandingCommandIds: ['cmd_pending'],
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
      expect(getStateLeaf).toHaveBeenCalledOnce();
      expect(newSyncRpcSessionLeaf).toHaveBeenCalledOnce();
      expect(disposeGatewayLeaf).toHaveBeenCalledOnce();
    });

    it('converts an encoded domain failure without retrying', async () => {
      getStateLeaf.mockResolvedValueOnce({
        result: encodeFailure(
          new ZerospinError({
            code: 'aggregate-frontend-state-domain-failure',
            message: 'Frontend state lookup failed',
          }),
        ),
        link: null,
      });

      const result = await Effect.runPromise(
        fetchAggregateFrontendState({
          aggregateVersion: '1.0.0',
          outstandingCommandIds: ['cmd_pending'],
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
          'aggregate-frontend-state-domain-failure',
        );
      }
      expect(getStateLeaf).toHaveBeenCalledOnce();
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
      systemId: 'sys_1',
      aggregateName: 'user',
      aggregateVersion: '1.0.0',
      frontendName: 'web',
      aggregateIndex: 1,
      userIndex: 5,
      resolutions: [],
      resources: [],
    };
    getStateLeaf.mockReset();
    createWebSocketTicketLeaf.mockReset();
    disposeGatewayLeaf.mockReset();
    newSyncRpcSessionLeaf.mockReturnValue({
      aggregate: () => ({
        authenticate: () => ({ authorize: () => mockFrontendApi }),
      }),
      [Symbol.dispose]: disposeGatewayLeaf,
    });
    generateSignature.mockResolvedValue(encodeSuccess({ userId: 'user_1' }));
    getStateLeaf
      .mockResolvedValueOnce({ result: encodeSuccess(state), link: null })
      .mockResolvedValueOnce({ result: encodeSuccess(state), link: null })
      .mockResolvedValue({
        result: encodeSuccess({ ...state, userIndex: 8 }),
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
      constructor() {
        sockets.push(this);
        queueMicrotask(() => this.onopen?.());
      }
      send(bytes: string) {
        const message = JSON.parse(bytes);
        resumed.push(message.userIndex);
        const next = message.userIndex + 1;
        for (let duplicate = 0; duplicate < 2; duplicate++) {
          this.onmessage?.({
            data: JSON.stringify({
              type: 'aggregateFrontendCommand',
              sync: {
                userIndex: next,
                aggregateIndex: 1,
                delta: {
                  inserted: [],
                  updated: [],
                  deleted: [],
                  mutations: [],
                },
                resolution: null,
              },
            }),
          });
        }
        this.onmessage?.({
          data: JSON.stringify({
            type: 'replay-complete',
            userIndex: next,
          }),
        });
      }
      close() {
        if (this.closed) return;
        this.closed = true;
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
      Effect.map(initializeFrontendGuards({ frontend: frontend }), guards =>
        {
          const session = makeAggregateSession({ frontend: frontend });
          session.setExecutionResources({
            sessionId: 'sesn_reconnect',
            guards,
            runtime: guardTestRuntime,
          });
          return session;
        },
      ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
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
              backupWorker: {
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
              },
            });
            expect(session.store.getState()).toMatchObject({
              aggregateIndex: 1,
              userIndex: 6,
              sessionStatus: 'current',
            });
            const recovered = Promise.withResolvers<void>();
            const unsubscribe = session.store.subscribe(next => {
              if (next.userIndex === 9) recovered.resolve();
            });
            sockets[0]!.close();
            yield* Effect.tryPromise(() => recovered.promise).pipe(
              Effect.ensuring(Effect.sync(unsubscribe)),
            );
            expect(resumed).toEqual([5, 8]);
            expect(session.store.getState()).toMatchObject({
              aggregateIndex: 1,
              userIndex: 9,
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
});

describe('frontend startup without a reusable backup', () => {
  it.each(['aggregate', 'service'])(
    'preserves the %s command stream connection failure',
    async kind => {
      getStateLeaf.mockReset();
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
      getStateLeaf.mockResolvedValue({
        result: encodeSuccess({
          authentication: { userId: 'user_1', aggregateId: 'acct_1' },
          systemId,
          frontendName: 'web',
          resources: [],
          ...(kind === 'aggregate'
            ? {
                aggregateId,
                aggregateName: 'user',
                aggregateVersion: '1.0.0',
                aggregateIndex: 0,
                userIndex: 0,
                resolutions: [],
              }
            : {
                serviceName: 'catalog',
                serviceVersion: '1.0.0',
                serviceIndex: 0,
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
        backupWorker,
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
                const guards = yield* initializeFrontendGuards({ frontend: frontend });
                return yield* bootstrapAggregateFrontendSession({
                  ...props,
                  aggregateVersion: '1.0.0',
                  session: (() => {
                    const __session = makeAggregateSession({ frontend: frontend });
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
        expect(overwriteDb).not.toHaveBeenCalled();
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
      systemId,
      frontendName: 'web',
      resources: [],
      ...(kind === 'aggregate'
        ? {
            aggregateId,
            aggregateName: 'user',
            aggregateVersion: '1.0.0',
            aggregateIndex: 0,
            userIndex: 0,
            resolutions: [],
          }
        : { serviceName: 'catalog', serviceVersion: '1.0.0', serviceIndex: 0 }),
    };
    getStateLeaf.mockReset();
    getStateLeaf.mockResolvedValue({
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
                  ? { userIndex: 0 }
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
            backupWorker,
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
            const guards = yield* initializeFrontendGuards({ frontend: frontend });
            const session = makeAggregateSession({ frontend: frontend });
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
      getStateLeaf.mockResolvedValue({
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
