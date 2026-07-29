import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeServiceFrontendController } from '@zerospin/core/serviceFrontendController/makeServiceFrontendController';
import { makeServiceFrontendControllerSpec } from '@zerospin/core/serviceFrontendController/makeServiceFrontendControllerSpec';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { ZerospinError } from '@zerospin/error';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import type * as Capnweb from 'capnweb';
import { Effect, Either, Layer, Redacted, Schema } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFrontendWebSocketTicket } from './createFrontendWebSocketTicket';
import { createServiceFrontendWebSocketTicket } from './createServiceFrontendWebSocketTicket';
import { fetchFrontend } from './fetchFrontend';
import { fetchFrontendState } from './fetchFrontendState';
import { fetchServiceFrontend } from './fetchServiceFrontend';
import { fetchServiceFrontendState } from './fetchServiceFrontendState';
import { pushFrontendCommands } from './pushFrontendCommands';

const newWebSocketRpcSessionMock = vi.hoisted(() => vi.fn());
const getFrontendApi = vi.hoisted(() => vi.fn());
const getServiceFrontendApi = vi.hoisted(() => vi.fn());
const fetchActorLeaf = vi.hoisted(() => vi.fn());
const makeFrontendSpecLeaf = vi.hoisted(() => vi.fn());
const accountStateLeaf = vi.hoisted(() => vi.fn());
const accountTicketLeaf = vi.hoisted(() => vi.fn());
const accountPushLeaf = vi.hoisted(() => vi.fn());
const serviceStateLeaf = vi.hoisted(() => vi.fn());
const serviceTicketLeaf = vi.hoisted(() => vi.fn());
const disposeAccountFrontendApi = vi.hoisted(() => vi.fn());
const disposeServiceFrontendApi = vi.hoisted(() => vi.fn());
const disposeRpcSession = vi.hoisted(() => vi.fn());

vi.mock('capnweb', async importOriginal => {
  const actual = await importOriginal<typeof Capnweb>();
  return {
    ...actual,
    newWebSocketRpcSession: newWebSocketRpcSessionMock,
  };
});

const accountFrontend = makeFrontendController({
  contracts: {},
  models: {},
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '1.0.0',
  systemName: 'frontend-lifetime-tests',
  signature: Schema.Struct({ subject: Schema.String }),
});

const serviceFrontend = makeServiceFrontendController({
  systemName: 'frontend-lifetime-tests',
  serviceName: 'catalog',
  actorName: 'shopper',
  frontendName: 'catalog',
  version: '1.0.0',
  models: {},
  signature: Schema.Struct({ subject: Schema.String }),
});

const accountIdentity = {
  actor: {
    accountId: 'acct_1',
    actorId: 'actr_1',
  },
  deployId: 'dpl_1',
  generationId: 'gen_1',
  systemId: 'sys_1',
  systemVersion: '1.0.0',
  systemWorkerName: 'system-worker-1',
  systemEnvironmentId: 'dev',
};

const serviceIdentity = {
  actorId: 'actr_1',
  systemId: 'sys_1',
  generationId: 'gen_1',
  systemVersion: '1.0.0',
  systemWorkerName: 'system-worker-1',
  serviceName: 'catalog',
  actorName: 'shopper',
  frontendName: 'catalog',
  frontendVersion: '1.0.0',
};

const TestLayer = Layer.mergeAll(
  AsyncLive,
  Layer.succeed(PublishableKey, Redacted.make('pk_frontend_lifetime')),
  Layer.succeed(ZerospinApisUrl, 'https://api.frontend-lifetime.test/'),
  makeTelemetryLayer(makeTelemetryCollector()),
);

describe('frontend admission RPC session lifetime', () => {
  beforeEach(() => {
    newWebSocketRpcSessionMock.mockReset();
    getFrontendApi.mockReset();
    getServiceFrontendApi.mockReset();
    fetchActorLeaf.mockReset();
    makeFrontendSpecLeaf.mockReset();
    accountStateLeaf.mockReset();
    accountTicketLeaf.mockReset();
    accountPushLeaf.mockReset();
    serviceStateLeaf.mockReset();
    serviceTicketLeaf.mockReset();
    disposeAccountFrontendApi.mockReset();
    disposeServiceFrontendApi.mockReset();
    disposeRpcSession.mockReset();

    getFrontendApi.mockReturnValue({
      fetchActor: fetchActorLeaf,
      makeFrontendSpec: makeFrontendSpecLeaf,
      getFrontendState: accountStateLeaf,
      createFrontendWebSocketTicket: accountTicketLeaf,
      pushCommands: accountPushLeaf,
      [Symbol.dispose]: disposeAccountFrontendApi,
    });
    newWebSocketRpcSessionMock.mockReturnValue({
      getFrontendApi,
      getServiceFrontendApi,
      [Symbol.dispose]: disposeRpcSession,
    });
  });

  it('keeps an admitted account session alive through state, ticket, and push leaves and releases it once', async () => {
    fetchActorLeaf.mockResolvedValue({
      result: encodeRight(accountIdentity),
      link: null,
    });
    makeFrontendSpecLeaf.mockResolvedValue({
      result: encodeRight(makeFrontendControllerSpec(accountFrontend)),
      link: null,
    });
    accountStateLeaf.mockImplementation(async () => {
      expect(disposeRpcSession).not.toHaveBeenCalled();
      return {
        result: encodeRight({ frontendIndex: 3 }),
        link: null,
      };
    });
    accountTicketLeaf.mockImplementation(async () => {
      expect(disposeRpcSession).not.toHaveBeenCalled();
      return {
        result: encodeRight({ ticket: 'gen_1.ticket' }),
        link: null,
      };
    });
    accountPushLeaf.mockImplementation(async () => {
      expect(disposeRpcSession).not.toHaveBeenCalled();
      return {
        result: encodeRight({
          pendingCommands: [],
          pushedCommands: [],
          failedCommands: [],
        }),
        link: null,
      };
    });

    const admitted = await Effect.runPromise(
      Effect.gen(function* () {
        const result = yield* fetchFrontend({
          frontend: accountFrontend,
          generateSignature: () => Effect.succeed({ subject: 'user-1' }),
        });
        yield* fetchFrontendState({ frontendApi: result.frontendApi });
        yield* createFrontendWebSocketTicket({
          frontendApi: result.frontendApi,
        });
        yield* pushFrontendCommands({
          frontendApi: result.frontendApi,
          commands: [],
        });
        return result;
      }).pipe(Effect.provide(TestLayer)),
    );

    expect(disposeRpcSession).not.toHaveBeenCalled();
    admitted.releaseFrontendApi();
    admitted.releaseFrontendApi();
    expect(disposeAccountFrontendApi).toHaveBeenCalledTimes(1);
    expect(disposeRpcSession).toHaveBeenCalledTimes(1);
    expect(disposeAccountFrontendApi.mock.invocationCallOrder[0]).toBeLessThan(
      disposeRpcSession.mock.invocationCallOrder[0]!,
    );
    expect(newWebSocketRpcSessionMock).toHaveBeenCalledWith(
      'wss://api.frontend-lifetime.test/',
    );
  });

  it('maps account WebSocket construction failure to the transport error channel', async () => {
    newWebSocketRpcSessionMock.mockImplementationOnce(() => {
      throw new Error('Account WebSocket construction failed');
    });

    const result = await Effect.runPromise(
      fetchFrontend({
        frontend: accountFrontend,
        generateSignature: () => Effect.succeed({ subject: 'user-1' }),
      }).pipe(Effect.either, Effect.provide(TestLayer)),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.code).toBe('async-failed');
    }
    expect(getFrontendApi).not.toHaveBeenCalled();
    expect(disposeAccountFrontendApi).not.toHaveBeenCalled();
    expect(disposeRpcSession).not.toHaveBeenCalled();
  });

  it('maps an early account WebSocket close to the transport error channel and releases the capability', async () => {
    fetchActorLeaf.mockRejectedValue(
      new Error('Account WebSocket closed during admission'),
    );

    const result = await Effect.runPromise(
      fetchFrontend({
        frontend: accountFrontend,
        generateSignature: () => Effect.succeed({ subject: 'user-1' }),
      }).pipe(Effect.either, Effect.provide(TestLayer)),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.code).toBe('async-failed');
    }
    expect(disposeAccountFrontendApi).toHaveBeenCalledTimes(1);
    expect(disposeRpcSession).toHaveBeenCalledTimes(1);
  });

  it('disposes an account session when admission fails before returning an API', async () => {
    fetchActorLeaf.mockResolvedValue({
      result: encodeLeft(
        new ZerospinError({
          code: 'account-admission-failed',
          message: 'Account admission failed',
        }),
      ),
      link: null,
    });

    const result = await Effect.runPromise(
      fetchFrontend({
        frontend: accountFrontend,
        generateSignature: () => Effect.succeed({ subject: 'user-1' }),
      }).pipe(Effect.either, Effect.provide(TestLayer)),
    );

    expect(Either.isLeft(result)).toBe(true);
    expect(disposeAccountFrontendApi).toHaveBeenCalledTimes(1);
    expect(disposeRpcSession).toHaveBeenCalledTimes(1);
  });

  it('disposes an account session when the admitted target differs from compiled code', async () => {
    fetchActorLeaf.mockResolvedValue({
      result: encodeRight(accountIdentity),
      link: null,
    });
    makeFrontendSpecLeaf.mockResolvedValue({
      result: encodeRight({
        ...makeFrontendControllerSpec(accountFrontend),
        version: '2.0.0',
      }),
      link: null,
    });

    const result = await Effect.runPromise(
      fetchFrontend({
        frontend: accountFrontend,
        generateSignature: () => Effect.succeed({ subject: 'user-1' }),
      }).pipe(Effect.either, Effect.provide(TestLayer)),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.code).toBe('frontend-admission-target-mismatch');
    }
    expect(disposeAccountFrontendApi).toHaveBeenCalledTimes(1);
    expect(disposeRpcSession).toHaveBeenCalledTimes(1);
  });

  it('keeps an admitted service session alive through state and ticket leaves and releases it once', async () => {
    const frontendApi = {
      getFrontendState: serviceStateLeaf,
      createFrontendWebSocketTicket: serviceTicketLeaf,
      [Symbol.dispose]: disposeServiceFrontendApi,
    };
    getServiceFrontendApi.mockResolvedValue({
      _tag: 'Success',
      identity: serviceIdentity,
      frontendSpec: makeServiceFrontendControllerSpec(serviceFrontend),
      frontendApi,
    });
    serviceStateLeaf.mockImplementation(async () => {
      expect(disposeRpcSession).not.toHaveBeenCalled();
      return {
        result: encodeRight({ frontendIndex: 4 }),
        link: null,
      };
    });
    serviceTicketLeaf.mockImplementation(async () => {
      expect(disposeRpcSession).not.toHaveBeenCalled();
      return {
        result: encodeRight({ ticket: 'gen_1.ticket' }),
        link: null,
      };
    });

    const admitted = await Effect.runPromise(
      Effect.gen(function* () {
        const result = yield* fetchServiceFrontend({
          frontend: serviceFrontend,
          generateSignature: () => Effect.succeed({ subject: 'user-1' }),
        });
        yield* fetchServiceFrontendState({ frontendApi: result.frontendApi });
        yield* createServiceFrontendWebSocketTicket({
          frontendApi: result.frontendApi,
        });
        return result;
      }).pipe(Effect.provide(TestLayer)),
    );

    expect(disposeRpcSession).not.toHaveBeenCalled();
    admitted.releaseFrontendApi();
    admitted.releaseFrontendApi();
    expect(disposeServiceFrontendApi).toHaveBeenCalledTimes(1);
    expect(disposeRpcSession).toHaveBeenCalledTimes(1);
    expect(disposeServiceFrontendApi.mock.invocationCallOrder[0]).toBeLessThan(
      disposeRpcSession.mock.invocationCallOrder[0]!,
    );
    expect(newWebSocketRpcSessionMock).toHaveBeenCalledWith(
      'wss://api.frontend-lifetime.test/',
    );
  });

  it('maps service WebSocket construction failure to the transport error channel', async () => {
    newWebSocketRpcSessionMock.mockImplementationOnce(() => {
      throw new Error('Service WebSocket construction failed');
    });

    const result = await Effect.runPromise(
      fetchServiceFrontend({
        frontend: serviceFrontend,
        generateSignature: () => Effect.succeed({ subject: 'user-1' }),
      }).pipe(Effect.either, Effect.provide(TestLayer)),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.code).toBe(
        'service-frontend-admission-transport-failed',
      );
    }
    expect(getServiceFrontendApi).not.toHaveBeenCalled();
    expect(disposeServiceFrontendApi).not.toHaveBeenCalled();
    expect(disposeRpcSession).not.toHaveBeenCalled();
  });

  it('maps an early service WebSocket close to the transport error channel and releases the session', async () => {
    getServiceFrontendApi.mockRejectedValue(
      new Error('Service WebSocket closed during admission'),
    );

    const result = await Effect.runPromise(
      fetchServiceFrontend({
        frontend: serviceFrontend,
        generateSignature: () => Effect.succeed({ subject: 'user-1' }),
      }).pipe(Effect.either, Effect.provide(TestLayer)),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.code).toBe(
        'service-frontend-admission-transport-failed',
      );
    }
    expect(disposeServiceFrontendApi).not.toHaveBeenCalled();
    expect(disposeRpcSession).toHaveBeenCalledTimes(1);
  });

  it('disposes a service session when admission returns a failure', async () => {
    getServiceFrontendApi.mockResolvedValue({
      _tag: 'Failure',
      failure: Schema.encodeSync(ZerospinError.schema)(
        new ZerospinError({
          code: 'service-admission-failed',
          message: 'Service admission failed',
        }),
      ),
      frontendApi: {
        [Symbol.dispose]: disposeServiceFrontendApi,
      },
    });

    const result = await Effect.runPromise(
      fetchServiceFrontend({
        frontend: serviceFrontend,
        generateSignature: () => Effect.succeed({ subject: 'user-1' }),
      }).pipe(Effect.either, Effect.provide(TestLayer)),
    );

    expect(Either.isLeft(result)).toBe(true);
    expect(disposeServiceFrontendApi).toHaveBeenCalledTimes(1);
    expect(disposeRpcSession).toHaveBeenCalledTimes(1);
  });

  it('disposes a service session when the admitted target differs from compiled code', async () => {
    getServiceFrontendApi.mockResolvedValue({
      _tag: 'Success',
      identity: {
        ...serviceIdentity,
        frontendVersion: '2.0.0',
      },
      frontendSpec: {
        ...makeServiceFrontendControllerSpec(serviceFrontend),
        version: '2.0.0',
      },
      frontendApi: {
        getFrontendState: serviceStateLeaf,
        createFrontendWebSocketTicket: serviceTicketLeaf,
        [Symbol.dispose]: disposeServiceFrontendApi,
      },
    });

    const result = await Effect.runPromise(
      fetchServiceFrontend({
        frontend: serviceFrontend,
        generateSignature: () => Effect.succeed({ subject: 'user-1' }),
      }).pipe(Effect.either, Effect.provide(TestLayer)),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.code).toBe(
        'service-frontend-admission-target-mismatch',
      );
    }
    expect(disposeServiceFrontendApi).toHaveBeenCalledTimes(1);
    expect(disposeRpcSession).toHaveBeenCalledTimes(1);
  });
});
