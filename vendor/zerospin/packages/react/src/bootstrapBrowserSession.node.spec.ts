import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeModel } from '@zerospin/core/models/makeModel';
import { primitives } from '@zerospin/core/models/primitives';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { SignatureFactory } from '@zerospin/core/services/SignatureFactory';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { getInitializedStateOrThrow } from '@zerospin/core/session/getInitializedStateOrThrow';
import { makeSession } from '@zerospin/core/session/makeSession';
import { mockFrontendApi } from '@zerospin/core/session/test-utils/mockFrontendApi';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { cloudIdAbbreviations } from '@zerospin/core/utils/cloudIdAbbreviations';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { ZerospinError } from '@zerospin/error';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import type * as Capnweb from 'capnweb';
import { Effect, Either, Layer, Redacted, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import { bootstrapBrowserSession } from './bootstrapBrowserSession';
import { makeBrowserUserController } from './makeBrowserUserController';

const newHttpBatchRpcSessionMock = vi.hoisted(() => vi.fn());
const getFrontendApi = vi.hoisted(() => vi.fn());

vi.mock('capnweb', async importOriginal => {
  const actual = await importOriginal<typeof Capnweb>();
  return {
    ...actual,
    newHttpBatchRpcSession: newHttpBatchRpcSessionMock,
  };
});

const Account = makeModel(
  {
    abbreviation: 'acct',
    modelName: 'account',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const frontend = makeFrontendController({
  contracts: {},
  models: {
    account: Account,
    user: User,
  },
  accountName: 'main',
  actorName: 'testFrontend',
  frontendName: 'default',
  version: '1.0.0',
  systemName: 'test-system',
  signature: Schema.Struct({}),
});

const frontendState = {
  actorId: 'usr_1',
  accountName: frontend.accountName,
  actorName: frontend.actorName,
  frontendName: frontend.frontendName,
  systemWorkerName: 'stub-deploy',
  frontendIndex: null,
  lastRebasedPushedCursor: null,
  pushedCommands: [],
  resources: [],
  executedPushedCommands: [],
  failedPushedCommands: [],
};

const telemetryCollector = makeTelemetryCollector();

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('bootstrapBrowserSession'),
  IncrementalMonotonicFactory,
  Layer.succeed(ZerospinApisUrl, 'https://api.example.com/'),
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  Layer.succeed(SignatureFactory, () => Effect.succeed({ actorId: 'usr_1' })),
  AsyncLive,
  makeTelemetryLayer(telemetryCollector),
  TestContext,
);

describe('bootstrapBrowserSession', () => {
  beforeEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
    telemetryCollector.flush();
    vi.mocked(mockFrontendApi.getFrontendState).mockImplementation(
      async () => ({
        result: encodeRight({
          actorId: frontendState.actorId,
          accountName: frontendState.accountName,
          actorName: frontendState.actorName,
          frontendName: frontendState.frontendName,
          systemWorkerName: frontendState.systemWorkerName,
          frontendIndex: null,
          lastRebasedPushedCursor: null,
          pushedCommands: [],
          resources: [],
          executedPushedCommands: [],
          failedPushedCommands: [],
        }),
        link: null,
      }),
    );
    vi.mocked(mockFrontendApi.fetchActor).mockResolvedValue(
      {
        result: encodeRight({
          actor: {
            accountId: 'acct_1',
            actorId: 'usr_1',
          },
          deployId: 'dpl_1',
          generationId: 'gen_1',
          systemId: 'sys_1',
          systemVersion: '1.0.0',
          systemWorkerName: 'stub-deploy',
          systemEnvironmentId: 'dev',
        }),
        link: null,
      },
    );
    getFrontendApi.mockImplementation(() => mockFrontendApi);
    newHttpBatchRpcSessionMock.mockReset();
    newHttpBatchRpcSessionMock.mockImplementation(() => ({
      getFrontendApi,
      [Symbol.dispose]: () => {
        /* Rpc session dispose (no-op in tests). */
      },
    }));
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it.layer(TestLayer)(it => {
    it.effect('hydrates the session database with fetched frontendState', () =>
      Effect.gen(function* () {
        const sessionId = yield* makeIdFromAbbreviation({
          abbreviation: cloudIdAbbreviations.defaultSession,
        });
        const session = makeSession({
          frontend,
          sessionId,
        });

        yield* bootstrapBrowserSession({
          session,
          browserUserController: makeBrowserUserController('user_1'),
          generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
        });

        expect(mockFrontendApi.getFrontendState).toHaveBeenCalledTimes(1);
        expect(session.store.getState().vfsName).toBe(null);
        expect(getInitializedStateOrThrow({ session }).isInitialized).toBe(
          true,
        );
      }),
    );

    it.effect(
      'returns a safe release effect when browser WebSocket is unavailable',
      () =>
        Effect.gen(function* () {
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: cloudIdAbbreviations.defaultSession,
          });
          const session = makeSession({
            frontend,
            sessionId,
          });

          const bootstrapResult = yield* bootstrapBrowserSession({
            session,
            browserUserController: makeBrowserUserController('user_1'),
            generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
          });
          yield* bootstrapResult.releaseBrowserSession;
        }),
      15_000,
    );

    it.effect('reports fetchActor RPC failures during bootstrap', () =>
      Effect.gen(function* () {
        vi.mocked(mockFrontendApi.fetchActor).mockResolvedValueOnce(
          {
            result: encodeLeft(
              new ZerospinError({
                code: 'fetch-actor-test-failure',
                message: 'Fetch actor failed in test',
              }),
            ),
            link: null,
          },
        );

        const sessionId = yield* makeIdFromAbbreviation({
          abbreviation: cloudIdAbbreviations.defaultSession,
        });
        const session = makeSession({
          frontend,
          sessionId,
        });

        const maybeBootstrap = yield* bootstrapBrowserSession({
          session,
          browserUserController: makeBrowserUserController('user_1'),
          generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
        }).pipe(Effect.either);

        expect(Either.isLeft(maybeBootstrap)).toBe(true);
        if (Either.isLeft(maybeBootstrap)) {
          expect(maybeBootstrap.left.code).toBe('fetch-actor-test-failure');
          expect(maybeBootstrap.left.message).toBe(
            'fetch-actor-test-failure: Fetch actor failed in test',
          );
        }
      }),
    );

    it.effect(
      'opens the browser WebSocket with the expected URL and closes it on release',
      () =>
        Effect.gen(function* () {
          const closeMock = vi.fn();
          const addEventListenerMock =
            vi.fn<
              (
                type: string,
                listener: (event: { data: unknown }) => void,
              ) => void
            >();
          const WebSocketMock = vi.fn(function (
            this: {
              addEventListener: typeof addEventListenerMock;
              close: typeof closeMock;
            },
            _url: string,
          ) {
            this.addEventListener = addEventListenerMock;
            this.close = closeMock;
          });
          Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: {
              WebSocket: WebSocketMock,
            },
          });

          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: cloudIdAbbreviations.defaultSession,
          });
          const session = makeSession({
            frontend,
            sessionId,
          });

          const bootstrapResult = yield* bootstrapBrowserSession({
            session,
            browserUserController: makeBrowserUserController('user_1'),
            generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
          });

          const frontendWebSocketUrl = new URL(
            String(WebSocketMock.mock.calls[0]?.[0]),
          );

          expect(WebSocketMock).toHaveBeenCalledTimes(1);
          expect(frontendWebSocketUrl.protocol).toBe('wss:');
          expect(frontendWebSocketUrl.pathname).toBe(
            '/ws-subscriber/frtbrepo_gen_1%2Facct_1%2Fmain%2FtestFrontend%2Fusr_1%2Fdefault',
          );
          expect(frontendWebSocketUrl.searchParams.get('publishableKey')).toBe(
            'pk_test',
          );
          expect(frontendWebSocketUrl.searchParams.get('accountName')).toBe(
            String(frontend.accountName),
          );
          expect(frontendWebSocketUrl.searchParams.get('actorName')).toBe(
            frontend.actorName,
          );
          expect(frontendWebSocketUrl.searchParams.get('frontendName')).toBe(
            frontend.frontendName,
          );
          expect(frontendWebSocketUrl.searchParams.get('signature')).toBe(
            JSON.stringify({ actorId: 'usr_1' }),
          );
          expect(addEventListenerMock).toHaveBeenCalledWith(
            'message',
            expect.any(Function),
          );
          const messageListener = addEventListenerMock.mock.calls[0]?.[1];
          if (messageListener === undefined) {
            throw new Error('Expected frontend websocket message listener');
          }
          const frontendBlockMessage = JSON.stringify({
            type: 'frontendBlock',
            sync: {
              frontendName: frontend.frontendName,
              lastAccountCursor: 'acur_1',
              frontendIndex: 1,
              lastRebasedPushedCursor: null,
              delta: {
                inserted: [],
                updated: [],
                deleted: [],
              },
              pendingPushedCommands: [],
              executedPushedCommands: [],
              failedPushedCommands: [],
            },
          });
          messageListener({ data: frontendBlockMessage });
          expect(session.store.getState().frontendIndex).toBe(1);
          expect(
            getInitializedStateOrThrow({ session }).lastRebasedPushedCursor,
          ).toBe(null);
          const appliedTelemetry = telemetryCollector.flush();
          const appliedSpan = appliedTelemetry.spans.find(
            span => span.name === 'acquireFrontendWebSocket.frontendBlock',
          );
          expect(appliedSpan).toMatchObject({
            parentSpanId: null,
            status: 'ok',
            attributes: {
              frontendIndex: 1,
              outcome: 'applied',
            },
          });

          messageListener({ data: frontendBlockMessage });
          expect(session.store.getState().frontendIndex).toBe(1);
          const staleTelemetry = telemetryCollector.flush();
          const staleSpan = staleTelemetry.spans.find(
            span => span.name === 'acquireFrontendWebSocket.frontendBlock',
          );
          expect(staleSpan).toMatchObject({
            parentSpanId: null,
            status: 'ok',
            attributes: {
              frontendIndex: 1,
              outcome: 'stale',
            },
          });
          expect(staleSpan?.traceId).not.toBe(appliedSpan?.traceId);

          expect(() => {
            messageListener({ data: 'not JSON' });
          }).toThrow();
          expect(session.store.getState().frontendIndex).toBe(1);
          const decodeFailureTelemetry = telemetryCollector.flush();
          expect(
            decodeFailureTelemetry.spans.find(
              span => span.name === 'acquireFrontendWebSocket.frontendBlock',
            ),
          ).toMatchObject({ parentSpanId: null, status: 'error' });

          expect(() => {
            messageListener({
              data: JSON.stringify({
                type: 'frontendBlock',
                sync: {
                  frontendName: frontend.frontendName,
                  lastAccountCursor: 'acur_2',
                  frontendIndex: 2,
                  lastRebasedPushedCursor: null,
                  delta: {
                    inserted: [],
                    updated: [],
                    deleted: [{ id: 'missing_1', modelName: 'missing' }],
                  },
                  pendingPushedCommands: [],
                  executedPushedCommands: [],
                  failedPushedCommands: [],
                },
              }),
            });
          }).toThrow();
          expect(session.store.getState().frontendIndex).toBe(1);
          const applyFailureTelemetry = telemetryCollector.flush();
          expect(
            applyFailureTelemetry.spans.find(
              span => span.name === 'acquireFrontendWebSocket.frontendBlock',
            ),
          ).toMatchObject({
            parentSpanId: null,
            status: 'error',
            attributes: { frontendIndex: 2 },
          });

          yield* bootstrapResult.releaseBrowserSession;

          expect(closeMock).toHaveBeenCalledTimes(1);
        }),
    );
  });
});
