import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeSignature } from '@zerospin/core/authentication/makeSignature';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { ZerospinError } from '@zerospin/error';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import { Effect, Either, Layer, Redacted, Schema } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticate } from './authenticate';
import { createAggregateFrontendWebSocketTicket } from './createAggregateFrontendWebSocketTicket';
import { fetchAggregateFrontendState } from './fetchAggregateFrontendState';

const newWebSocketRpcSessionMock = vi.hoisted(() => vi.fn());
const getAuthenticatedApi = vi.hoisted(() => vi.fn());
const disposeRpcSession = vi.hoisted(() => vi.fn());
const getStateLeaf = vi.hoisted(() => vi.fn());
const createWebSocketTicketLeaf = vi.hoisted(() => vi.fn());

vi.mock('capnweb', () => ({
  newWebSocketRpcSession: newWebSocketRpcSessionMock,
}));

const authenticationSignature = makeSignature(
  {
    version: '1.0.0',
    schema: Schema.Struct({ userId: Schema.NonEmptyString }),
  },
  [],
);

const mockFrontendApi = {
  getState: getStateLeaf,
  createWebSocketTicket: createWebSocketTicketLeaf,
};

const TestLayer = Layer.mergeAll(
  AsyncLive,
  Layer.succeed(PublishableKey, Redacted.make('pk_frontend_test')),
  Layer.succeed(ZerospinApiUrl, 'https://api.frontend.test/'),
  makeTelemetryLayer(makeTelemetryCollector()),
);

describe('@zerospin/frontend programs', () => {
  beforeEach(() => {
    getAuthenticatedApi.mockReset();
    disposeRpcSession.mockReset();
    getStateLeaf.mockReset();
    createWebSocketTicketLeaf.mockReset();
    newWebSocketRpcSessionMock.mockReset();
    newWebSocketRpcSessionMock.mockReturnValue({
      getAuthenticatedApi,
      [Symbol.dispose]: disposeRpcSession,
    });
  });

  describe('authenticate', () => {
    it('authenticates once, preserves the bound AuthenticatedApi, and releases the transport once', async () => {
      const authenticationLock = await Effect.runPromise(
        makeAuthenticationLock({ signature: authenticationSignature }),
      );
      const authenticatedApi = {
        getAuthentication: vi.fn(async () =>
          encodeRight({
            authenticationLock,
            systemId: 'sys_1',
            systemName: 'aggregate-frontend-program-tests',
            systemVersion: '1.0.0',
            userId: 'user_1',
          }),
        ),
        getAggregateFrontendApi: vi.fn(),
        getServiceFrontendApi: vi.fn(),
      };
      getAuthenticatedApi.mockResolvedValueOnce(authenticatedApi);

      const result = await Effect.runPromise(
        authenticate({
          authenticationLock,
          generateSignature: () => Effect.succeed({ userId: 'user_1' }),
        }).pipe(Effect.provide(TestLayer)),
      );

      expect(result.userId).toBe('user_1');
      expect(result.authenticatedApi).toBe(authenticatedApi);
      expect(getAuthenticatedApi).toHaveBeenCalledOnce();
      expect(getAuthenticatedApi).toHaveBeenCalledWith({
        publishableKey: 'pk_frontend_test',
        authenticationLock,
        signature: { userId: 'user_1' },
      });
      expect(newWebSocketRpcSessionMock).toHaveBeenCalledWith(
        'wss://api.frontend.test/',
      );
      expect(disposeRpcSession).not.toHaveBeenCalled();

      result.releaseAuthenticatedApi();
      result.releaseAuthenticatedApi();
      expect(disposeRpcSession).toHaveBeenCalledOnce();
    });

    it('releases the transport when authentication returns a domain failure', async () => {
      const authenticationLock = await Effect.runPromise(
        makeAuthenticationLock({ signature: authenticationSignature }),
      );
      getAuthenticatedApi.mockResolvedValueOnce({
        getAuthentication: vi.fn(async () =>
          encodeLeft(
            new ZerospinError({
              code: 'user-authentication-failed',
              message: 'Authentication failed',
            }),
          ),
        ),
      });

      const result = await Effect.runPromise(
        authenticate({
          authenticationLock,
          generateSignature: () => Effect.succeed({ userId: 'user_1' }),
        }).pipe(Effect.either, Effect.provide(TestLayer)),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe('user-authentication-failed');
      }
      expect(disposeRpcSession).toHaveBeenCalledOnce();
    });

    it('rejects an invalid generated signature before opening transport', async () => {
      const authenticationLock = await Effect.runPromise(
        makeAuthenticationLock({ signature: authenticationSignature }),
      );
      const result = await Effect.runPromise(
        authenticate({
          authenticationLock,
          generateSignature: () =>
            Effect.succeed({ userId: '' }).pipe(
              Effect.flatMap(
                Schema.decodeUnknown(authenticationSignature.schema),
              ),
              Effect.mapError(
                error =>
                  new ZerospinError({
                    code: 'authentication-signature-invalid',
                    message:
                      'Generated authentication signature does not match the selected schema',
                    cause: ZerospinError.prettyUnknownFailure(error),
                  }),
              ),
            ),
        }).pipe(Effect.either, Effect.provide(TestLayer)),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe('authentication-signature-invalid');
      }
      expect(newWebSocketRpcSessionMock).not.toHaveBeenCalled();
    });
  });

  describe('createAggregateFrontendWebSocketTicket', () => {
    it('uses the admitted target for each fresh ticket request', async () => {
      createWebSocketTicketLeaf
        .mockResolvedValueOnce({
          result: encodeRight({ ticket: 'gen_1.raw-ticket-one' }),
          link: null,
        })
        .mockResolvedValueOnce({
          result: encodeRight({ ticket: 'gen_1.raw-ticket-two' }),
          link: null,
        });

      const first = await Effect.runPromise(
        createAggregateFrontendWebSocketTicket({
          frontendApi: mockFrontendApi,
        }).pipe(Effect.provide(TestLayer)),
      );
      const second = await Effect.runPromise(
        createAggregateFrontendWebSocketTicket({
          frontendApi: mockFrontendApi,
        }).pipe(Effect.provide(TestLayer)),
      );

      expect(first.ticket).toBe('gen_1.raw-ticket-one');
      expect(second.ticket).toBe('gen_1.raw-ticket-two');
      expect(createWebSocketTicketLeaf).toHaveBeenCalledTimes(2);
    });

    it('preserves an encoded ticket failure without retrying', async () => {
      createWebSocketTicketLeaf.mockResolvedValueOnce({
        result: encodeLeft(
          new ZerospinError({
            code: 'aggregate-frontend-websocket-ticket-write-failed',
            message: 'Ticket storage failed',
          }),
        ),
        link: null,
      });

      const result = await Effect.runPromise(
        createAggregateFrontendWebSocketTicket({
          frontendApi: mockFrontendApi,
        }).pipe(Effect.either, Effect.provide(TestLayer)),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe(
          'aggregate-frontend-websocket-ticket-write-failed',
        );
      }
      expect(createWebSocketTicketLeaf).toHaveBeenCalledOnce();
    });
  });

  describe('fetchAggregateFrontendState', () => {
    it('wraps the concrete frontend target and returns a typed success', async () => {
      const state = {
        aggregateId: 'acct_1',
        userId: 'user_1',
        systemId: 'sys_1',
        systemVersion: '1.0.1',
        aggregateName: 'user',
        frontendName: 'web',
        frontendIndex: 0,
        pushedCommands: [],
        resources: [],
        executedPushedCommands: [],
        failedPushedCommands: [],
      };
      getStateLeaf.mockResolvedValueOnce({
        result: encodeRight(state),
        link: null,
      });

      const result = await Effect.runPromise(
        fetchAggregateFrontendState({ frontendApi: mockFrontendApi }).pipe(
          Effect.provide(TestLayer),
        ),
      );

      expect(result).toEqual(state);
      expect(getStateLeaf).toHaveBeenCalledOnce();
    });

    it('converts an encoded domain failure without retrying', async () => {
      getStateLeaf.mockResolvedValueOnce({
        result: encodeLeft(
          new ZerospinError({
            code: 'aggregate-frontend-state-domain-failure',
            message: 'Frontend state lookup failed',
          }),
        ),
        link: null,
      });

      const result = await Effect.runPromise(
        fetchAggregateFrontendState({ frontendApi: mockFrontendApi }).pipe(
          Effect.either,
          Effect.provide(TestLayer),
        ),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe(
          'aggregate-frontend-state-domain-failure',
        );
      }
      expect(getStateLeaf).toHaveBeenCalledOnce();
    });
  });
});
