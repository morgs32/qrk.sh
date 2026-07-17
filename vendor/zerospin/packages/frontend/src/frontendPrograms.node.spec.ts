import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { SignatureFactory } from '@zerospin/core/services/SignatureFactory';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { makeServiceController } from '@zerospin/core/service/makeServiceController';
import { makeSession } from '@zerospin/core/session/makeSession';
import type { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import { ZerospinError } from '@zerospin/error';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import { Effect, Either, Layer, Redacted, Schema } from 'effect';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';

import { executeActorQuery } from './executeActorQuery';
import { fetchActor } from './fetchActor';
import { fetchFrontendState } from './fetchFrontendState';

const newSyncRpcSessionMock = vi.hoisted(() => vi.fn());
const getFrontendApi = vi.hoisted(() => vi.fn());
const fetchActorLeaf = vi.hoisted(() => vi.fn());
const getFrontendStateLeaf = vi.hoisted(() => vi.fn());
const executeActorQueryLeaf = vi.hoisted(() => vi.fn());

vi.mock('@zerospin/core/utils/newSyncRpcSession', () => ({
  newSyncRpcSession: newSyncRpcSessionMock,
}));

const frontend = makeFrontendController({
  contracts: {},
  models: {},
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '1.0.0',
  systemName: 'frontend-program-tests',
  signature: Schema.Struct({
    userId: Schema.String,
  }),
});

const catalogService = makeServiceController({
  name: 'catalog',
  version: '1.0.0',
  models: {},
  contracts: {},
  queries: {
    getProducts: {
      paramsSchema: Schema.Struct({
        limit: Schema.Number,
      }),
      query: ({ params }) => Effect.succeed({ total: params.limit }),
    },
  },
});

const shopperActor = {
  name: 'shopper',
  api: {
    getProducts: catalogService.queries.getProducts,
  },
};

describe('@zerospin/frontend programs', () => {
  beforeEach(() => {
    getFrontendApi.mockReset();
    fetchActorLeaf.mockReset();
    getFrontendStateLeaf.mockReset();
    executeActorQueryLeaf.mockReset();
    newSyncRpcSessionMock.mockReset();

    getFrontendApi.mockReturnValue({
      fetchActor: fetchActorLeaf,
      getFrontendState: getFrontendStateLeaf,
      executeActorQuery: executeActorQueryLeaf,
    });
    newSyncRpcSessionMock.mockReturnValue({
      getFrontendApi,
      [Symbol.dispose]: () => {
        /* The mocked synchronous RPC session has no resources to release. */
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchActor', () => {
    it('uses the concrete ZerospinApis target, wraps the leaf, and returns success', async () => {
      expectTypeOf<
        ReturnType<
          typeof newSyncRpcSession<ZerospinApis>
        >['getFrontendApi']
      >().toBeFunction();

      fetchActorLeaf.mockResolvedValueOnce({
        result: encodeRight({
          actor: {
            accountId: 'acct_1',
            actorId: 'actr_1',
          },
          deployId: 'dpl_1',
          generationId: 'gen_1',
          systemId: 'sys_1',
          systemVersion: '1.0.1',
          systemWorkerName: 'system-worker-stub',
          systemEnvironmentId: 'dev',
        }),
        link: null,
      });
      const session = makeSession({
        frontend,
        sessionId: 'sesn_fetch_actor_success',
      });
      const collector = makeTelemetryCollector();

      const result = await Effect.runPromise(
        fetchActor({ session }).pipe(
          Effect.provide(
            Layer.mergeAll(
              AsyncLive,
              Layer.succeed(
                PublishableKey,
                Redacted.make('pk_frontend_test'),
              ),
              Layer.succeed(SignatureFactory, () =>
                Effect.succeed({ userId: 'usr_1' }),
              ),
              Layer.succeed(
                ZerospinApisUrl,
                'https://api.frontend.test/',
              ),
              makeTelemetryLayer(collector),
            ),
          ),
        ),
      );

      expect(result).toEqual({
        actor: {
          accountId: 'acct_1',
          actorId: 'actr_1',
        },
        deployId: 'dpl_1',
        generationId: 'gen_1',
        systemId: 'sys_1',
        systemVersion: '1.0.1',
        systemWorkerName: 'system-worker-stub',
        systemEnvironmentId: 'dev',
      });
      expect(newSyncRpcSessionMock).toHaveBeenCalledWith(
        'https://api.frontend.test/',
      );
      expect(getFrontendApi).toHaveBeenCalledWith({
        publishableKey: 'pk_frontend_test',
        accountName: 'user',
        actorName: 'shopper',
        frontendName: 'web',
        signature: { userId: 'usr_1' },
      });
      expect(fetchActorLeaf).toHaveBeenCalledWith({
        args: [],
        traceContext: expect.objectContaining({
          traceId: expect.stringMatching(/^trc_/),
          parentSpanId: expect.stringMatching(/^spn_/),
        }),
      });
    });

    it('converts an encoded domain failure and does not retry', async () => {
      fetchActorLeaf.mockResolvedValueOnce({
        result: encodeLeft(
          new ZerospinError({
            code: 'fetch-actor-domain-failure',
            message: 'Actor lookup failed',
          }),
        ),
        link: null,
      });
      const session = makeSession({
        frontend,
        sessionId: 'sesn_fetch_actor_domain_failure',
      });
      const collector = makeTelemetryCollector();

      const result = await Effect.runPromise(
        fetchActor({ session }).pipe(
          Effect.either,
          Effect.provide(
            Layer.mergeAll(
              AsyncLive,
              Layer.succeed(
                PublishableKey,
                Redacted.make('pk_frontend_test'),
              ),
              Layer.succeed(SignatureFactory, () =>
                Effect.succeed({ userId: 'usr_1' }),
              ),
              Layer.succeed(
                ZerospinApisUrl,
                'https://api.frontend.test/',
              ),
              makeTelemetryLayer(collector),
            ),
          ),
        ),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe('fetch-actor-domain-failure');
        expect(result.left.message).toBe(
          'fetch-actor-domain-failure: Actor lookup failed',
        );
      }
      expect(fetchActorLeaf).toHaveBeenCalledTimes(1);
      expect(getFrontendApi).toHaveBeenCalledTimes(1);
    });

    it('converts a transport rejection and does not retry', async () => {
      fetchActorLeaf.mockRejectedValueOnce(
        new Error('fetchActor transport unavailable'),
      );
      const session = makeSession({
        frontend,
        sessionId: 'sesn_fetch_actor_transport_failure',
      });
      const collector = makeTelemetryCollector();

      const result = await Effect.runPromise(
        fetchActor({ session }).pipe(
          Effect.either,
          Effect.provide(
            Layer.mergeAll(
              AsyncLive,
              Layer.succeed(
                PublishableKey,
                Redacted.make('pk_frontend_test'),
              ),
              Layer.succeed(SignatureFactory, () =>
                Effect.succeed({ userId: 'usr_1' }),
              ),
              Layer.succeed(
                ZerospinApisUrl,
                'https://api.frontend.test/',
              ),
              makeTelemetryLayer(collector),
            ),
          ),
        ),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe('async-failed');
        expect(result.left.message).toBe(
          'async-failed: fetchActor transport unavailable',
        );
      }
      expect(fetchActorLeaf).toHaveBeenCalledTimes(1);
      expect(getFrontendApi).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchFrontendState', () => {
    it('wraps the concrete frontend target and returns a typed success', async () => {
      getFrontendStateLeaf.mockResolvedValueOnce({
        result: encodeRight({
          actorId: 'actr_1',
          systemWorkerName: 'system-worker-stub',
          accountName: 'user',
          actorName: 'shopper',
          frontendName: 'web',
          frontendIndex: null,
          lastRebasedPushedCursor: null,
          pushedCommands: [],
          resources: [],
          executedPushedCommands: [],
          failedPushedCommands: [],
        }),
        link: null,
      });
      const session = makeSession({
        frontend,
        sessionId: 'sesn_fetch_frontend_state_success',
      });
      const collector = makeTelemetryCollector();

      const result = await Effect.runPromise(
        fetchFrontendState({ session }).pipe(
          Effect.provide(
            Layer.mergeAll(
              AsyncLive,
              Layer.succeed(
                PublishableKey,
                Redacted.make('pk_frontend_test'),
              ),
              Layer.succeed(SignatureFactory, () =>
                Effect.succeed({ userId: 'usr_1' }),
              ),
              Layer.succeed(
                ZerospinApisUrl,
                'https://api.frontend.test/',
              ),
              makeTelemetryLayer(collector),
            ),
          ),
        ),
      );

      expect(result).toEqual({
        actorId: 'actr_1',
        systemWorkerName: 'system-worker-stub',
        accountName: 'user',
        actorName: 'shopper',
        frontendName: 'web',
        frontendIndex: null,
        lastRebasedPushedCursor: null,
        pushedCommands: [],
        resources: [],
        executedPushedCommands: [],
        failedPushedCommands: [],
      });
      expect(getFrontendStateLeaf).toHaveBeenCalledWith({
        args: [],
        traceContext: expect.objectContaining({
          traceId: expect.stringMatching(/^trc_/),
          parentSpanId: expect.stringMatching(/^spn_/),
        }),
      });
    });

    it('converts an encoded domain failure and does not retry', async () => {
      getFrontendStateLeaf.mockResolvedValueOnce({
        result: encodeLeft(
          new ZerospinError({
            code: 'frontend-state-domain-failure',
            message: 'Frontend state lookup failed',
          }),
        ),
        link: null,
      });
      const session = makeSession({
        frontend,
        sessionId: 'sesn_fetch_frontend_state_domain_failure',
      });
      const collector = makeTelemetryCollector();

      const result = await Effect.runPromise(
        fetchFrontendState({ session }).pipe(
          Effect.either,
          Effect.provide(
            Layer.mergeAll(
              AsyncLive,
              Layer.succeed(
                PublishableKey,
                Redacted.make('pk_frontend_test'),
              ),
              Layer.succeed(SignatureFactory, () =>
                Effect.succeed({ userId: 'usr_1' }),
              ),
              Layer.succeed(
                ZerospinApisUrl,
                'https://api.frontend.test/',
              ),
              makeTelemetryLayer(collector),
            ),
          ),
        ),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe('frontend-state-domain-failure');
        expect(result.left.message).toBe(
          'frontend-state-domain-failure: Frontend state lookup failed',
        );
      }
      expect(getFrontendStateLeaf).toHaveBeenCalledTimes(1);
      expect(getFrontendApi).toHaveBeenCalledTimes(1);
    });

    it('converts a transport rejection and does not retry', async () => {
      getFrontendStateLeaf.mockRejectedValueOnce(
        new Error('getFrontendState transport unavailable'),
      );
      const session = makeSession({
        frontend,
        sessionId: 'sesn_fetch_frontend_state_transport_failure',
      });
      const collector = makeTelemetryCollector();

      const result = await Effect.runPromise(
        fetchFrontendState({ session }).pipe(
          Effect.either,
          Effect.provide(
            Layer.mergeAll(
              AsyncLive,
              Layer.succeed(
                PublishableKey,
                Redacted.make('pk_frontend_test'),
              ),
              Layer.succeed(SignatureFactory, () =>
                Effect.succeed({ userId: 'usr_1' }),
              ),
              Layer.succeed(
                ZerospinApisUrl,
                'https://api.frontend.test/',
              ),
              makeTelemetryLayer(collector),
            ),
          ),
        ),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe('async-failed');
        expect(result.left.message).toBe(
          'async-failed: getFrontendState transport unavailable',
        );
      }
      expect(getFrontendStateLeaf).toHaveBeenCalledTimes(1);
      expect(getFrontendApi).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeActorQuery', () => {
    it('wraps the concrete frontend target and returns success', async () => {
      executeActorQueryLeaf.mockResolvedValueOnce({
        result: encodeRight({ total: 7 }),
        link: null,
      });
      const session = makeSession({
        frontend,
        sessionId: 'sesn_execute_actor_query_success',
      });
      const collector = makeTelemetryCollector();

      const program = executeActorQuery<
        typeof shopperActor,
        typeof frontend,
        'getProducts'
      >({
        session,
        generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
        queryName: 'getProducts',
        params: { limit: 7 },
      });
      expectTypeOf(program).toMatchTypeOf<
        Effect.Effect<{ total: number }, ZerospinError, unknown>
      >();

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(
            Layer.mergeAll(
              AsyncLive,
              Layer.succeed(
                PublishableKey,
                Redacted.make('pk_frontend_test'),
              ),
              Layer.succeed(
                ZerospinApisUrl,
                'https://api.frontend.test/',
              ),
              makeTelemetryLayer(collector),
            ),
          ),
        ),
      );

      expect(result).toEqual({ total: 7 });
      expect(getFrontendApi).toHaveBeenCalledWith({
        publishableKey: 'pk_frontend_test',
        accountName: 'user',
        actorName: 'shopper',
        frontendName: 'web',
        signature: { userId: 'usr_1' },
      });
      expect(executeActorQueryLeaf).toHaveBeenCalledWith({
        args: [
          {
            queryName: 'getProducts',
            params: { limit: 7 },
          },
        ],
        traceContext: expect.objectContaining({
          traceId: expect.stringMatching(/^trc_/),
          parentSpanId: expect.stringMatching(/^spn_/),
        }),
      });
    });

    it('converts an encoded domain failure and does not retry', async () => {
      executeActorQueryLeaf.mockResolvedValueOnce({
        result: encodeLeft(
          new ZerospinError({
            code: 'actor-query-domain-failure',
            message: 'Actor query failed',
          }),
        ),
        link: null,
      });
      const session = makeSession({
        frontend,
        sessionId: 'sesn_execute_actor_query_domain_failure',
      });
      const collector = makeTelemetryCollector();

      const result = await Effect.runPromise(
        executeActorQuery<
          typeof shopperActor,
          typeof frontend,
          'getProducts'
        >({
          session,
          generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
          queryName: 'getProducts',
          params: { limit: 7 },
        }).pipe(
          Effect.either,
          Effect.provide(
            Layer.mergeAll(
              AsyncLive,
              Layer.succeed(
                PublishableKey,
                Redacted.make('pk_frontend_test'),
              ),
              Layer.succeed(
                ZerospinApisUrl,
                'https://api.frontend.test/',
              ),
              makeTelemetryLayer(collector),
            ),
          ),
        ),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe('actor-query-domain-failure');
        expect(result.left.message).toBe(
          'actor-query-domain-failure: Actor query failed',
        );
      }
      expect(executeActorQueryLeaf).toHaveBeenCalledTimes(1);
      expect(getFrontendApi).toHaveBeenCalledTimes(1);
    });

    it('converts a transport rejection and does not retry', async () => {
      executeActorQueryLeaf.mockRejectedValueOnce(
        new Error('executeActorQuery transport unavailable'),
      );
      const session = makeSession({
        frontend,
        sessionId: 'sesn_execute_actor_query_transport_failure',
      });
      const collector = makeTelemetryCollector();

      const result = await Effect.runPromise(
        executeActorQuery<
          typeof shopperActor,
          typeof frontend,
          'getProducts'
        >({
          session,
          generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
          queryName: 'getProducts',
          params: { limit: 7 },
        }).pipe(
          Effect.either,
          Effect.provide(
            Layer.mergeAll(
              AsyncLive,
              Layer.succeed(
                PublishableKey,
                Redacted.make('pk_frontend_test'),
              ),
              Layer.succeed(
                ZerospinApisUrl,
                'https://api.frontend.test/',
              ),
              makeTelemetryLayer(collector),
            ),
          ),
        ),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe('async-failed');
        expect(result.left.message).toBe(
          'async-failed: executeActorQuery transport unavailable',
        );
      }
      expect(executeActorQueryLeaf).toHaveBeenCalledTimes(1);
      expect(getFrontendApi).toHaveBeenCalledTimes(1);
    });
  });
});
