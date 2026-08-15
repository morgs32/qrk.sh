import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { ZerospinError } from '@zerospin/error';
import { Effect, Layer, Schema } from 'effect';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AggregateFrontendApi } from '../AggregateFrontendApi/AggregateFrontendApi.js';
import { AggregateFrontendApiFailure } from '../AggregateFrontendApi/AggregateFrontendApiFailure/AggregateFrontendApiFailure.js';
import { makeSystemRuntime } from '../makeSystemRuntime.js';
import { ServiceFrontendApi } from '../ServiceFrontendApi/ServiceFrontendApi.js';
import { ServiceFrontendApiFailure } from '../ServiceFrontendApi/ServiceFrontendApiFailure/ServiceFrontendApiFailure.js';
import { SystemWorkerResolver } from '../SystemWorkerResolver/SystemWorkerResolver.js';

import { AuthenticatedApi } from './AuthenticatedApi.js';
import { AuthenticatedApiFailure } from './AuthenticatedApiFailure/AuthenticatedApiFailure.js';

const { getSystemRepo } = vi.hoisted(() => ({ getSystemRepo: vi.fn() }));
vi.mock('../SystemRepo/SystemRepo.js', () => ({
  SystemRepo: { getRepo: getSystemRepo },
}));

const systemId = Schema.decodeUnknownSync(makeAbbreviationIdSchema('sys'))(
  'sys_authenticated_api_test',
);
const aggregateId = Schema.decodeUnknownSync(makeAbbreviationIdSchema('acct'))(
  'acct_authenticated_api_test',
);
const authenticationLock = {
  signature: {
    version: '1.0.0',
    schemaJsonSchema: { type: 'object' },
  },
};
const aggregateFrontendLock = {
  systemName: 'authenticated-api-test',
  frontendName: 'dashboard',
  models: {},
  contracts: {},
};
const serviceFrontendLock = {
  systemName: 'authenticated-api-test',
  frontendName: 'catalog',
  models: {},
};
const aggregateFrontendSpec = {
  kind: 'aggregate',
  systemName: 'authenticated-api-test',
  aggregateName: 'account',
  frontendName: 'dashboard',
  modelNames: [],
  models: {},
  contracts: {},
  aggregateFrontendLock,
} satisfies IFrontendControllerSpec;
const serviceFrontendSpec = {
  kind: 'service',
  systemName: 'authenticated-api-test',
  serviceName: 'products',
  frontendName: 'catalog',
  modelNames: [],
  models: {},
  contracts: {},
  serviceFrontendLock,
} satisfies IFrontendControllerSpec;
const actorRef = {
  aggregateId,
  aggregateName: 'account',
  userId: 'user_authenticated_api_test',
};
const getSystemWorker = vi.fn();
const runtime = makeSystemRuntime({
  systemWorkerResolver: Layer.succeed(SystemWorkerResolver, {
    get: getSystemWorker,
  }),
});

describe('AuthenticatedApi', () => {
  beforeEach(() => {
    getSystemWorker.mockReset();
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('returns the flat authentication receipt and exact aggregate and service admission receipts', async () => {
    const aggregateDispose = vi.fn();
    const serviceDispose = vi.fn();
    const authorizeAggregateFrontend = vi.fn(async () =>
      encodeRight({
        actorRef,
        aggregateFrontendLock,
        frontendSpec: aggregateFrontendSpec,
        systemVersion: '2.1.0',
      }),
    );
    const authorizeServiceFrontend = vi.fn(async () =>
      encodeRight({
        userId: 'user_authenticated_api_test',
        serviceFrontendLock,
        frontendSpec: serviceFrontendSpec,
        systemVersion: '2.1.0',
      }),
    );
    getSystemWorker
      .mockReturnValueOnce({
        authorizeAggregateFrontend,
        [Symbol.dispose]: aggregateDispose,
      })
      .mockReturnValueOnce({
        authorizeServiceFrontend,
        [Symbol.dispose]: serviceDispose,
      });
    const authenticatedApi = new AuthenticatedApi({
      authentication: {
        authenticationLock,
        generationId: 'gen_authenticated_snapshot',
        systemId,
        systemName: 'authenticated-api-test',
        systemVersion: '2.0.0',
        systemWorkerName: 'sys_authenticated_api_test:dev',
        userId: 'user_authenticated_api_test',
      },
      runtime,
    });

    const authentication = await Effect.runPromise(
      decodeRpc(await authenticatedApi.getAuthentication()),
    );
    const aggregateApi = await authenticatedApi.getAggregateFrontendApi({
      aggregateId,
      aggregateName: 'account',
      frontendName: 'dashboard',
      aggregateFrontendLock,
    });
    const serviceApi = await authenticatedApi.getServiceFrontendApi({
      serviceName: 'products',
      frontendName: 'catalog',
      serviceFrontendLock,
    });
    const aggregateAdmission = await Effect.runPromise(
      decodeRpc(await aggregateApi.getAdmission()),
    );
    const serviceAdmission = await Effect.runPromise(
      decodeRpc(await serviceApi.getAdmission()),
    );

    expect(authentication).toEqual({
      authenticationLock,
      systemId,
      systemName: 'authenticated-api-test',
      systemVersion: '2.0.0',
      userId: 'user_authenticated_api_test',
    });
    expect(Object.keys(authentication).toSorted()).toEqual([
      'authenticationLock',
      'systemId',
      'systemName',
      'systemVersion',
      'userId',
    ]);
    expect(aggregateAdmission).toEqual({
      actorRef,
      aggregateFrontendLock,
      frontendName: 'dashboard',
      frontendSpec: aggregateFrontendSpec,
      systemId,
      systemVersion: '2.1.0',
    });
    expect(Object.keys(aggregateAdmission).toSorted()).toEqual([
      'actorRef',
      'aggregateFrontendLock',
      'frontendName',
      'frontendSpec',
      'systemId',
      'systemVersion',
    ]);
    expect(serviceAdmission).toEqual({
      userId: 'user_authenticated_api_test',
      serviceName: 'products',
      frontendName: 'catalog',
      serviceFrontendLock,
      frontendSpec: serviceFrontendSpec,
      systemId,
      systemVersion: '2.1.0',
    });
    expect(Object.keys(serviceAdmission).toSorted()).toEqual([
      'frontendName',
      'frontendSpec',
      'serviceFrontendLock',
      'serviceName',
      'systemId',
      'systemVersion',
      'userId',
    ]);
    expect(authorizeAggregateFrontend).toHaveBeenCalledWith({
      aggregateId,
      aggregateName: 'account',
      frontendName: 'dashboard',
      aggregateFrontendLock,
      generationId: 'gen_authenticated_snapshot',
      userId: 'user_authenticated_api_test',
    });
    expect(authorizeServiceFrontend).toHaveBeenCalledWith({
      generationId: 'gen_authenticated_snapshot',
      serviceName: 'products',
      frontendName: 'catalog',
      serviceFrontendLock,
      userId: 'user_authenticated_api_test',
    });
    expect(getSystemWorker).toHaveBeenNthCalledWith(1, {
      systemWorkerName: 'sys_authenticated_api_test:dev',
    });
    expect(getSystemWorker).toHaveBeenNthCalledWith(2, {
      systemWorkerName: 'sys_authenticated_api_test:dev',
    });
    expect(aggregateDispose).toHaveBeenCalledOnce();
    expect(serviceDispose).toHaveBeenCalledOnce();
  });

  it('failure targets expose the exact success surfaces and replay one captured error through their receipts and leaves', async () => {
    const failure = new ZerospinError({
      code: 'user-authentication-failed',
      message: 'Authentication failed',
      status: 401,
    });
    const authenticatedApiFailure = new AuthenticatedApiFailure(failure);

    expect(
      Object.getOwnPropertyNames(AuthenticatedApiFailure.prototype)
        .filter(name => name !== 'constructor')
        .toSorted(),
    ).toEqual(
      Object.getOwnPropertyNames(AuthenticatedApi.prototype)
        .filter(name => name !== 'constructor')
        .toSorted(),
    );

    const aggregateApiFailure =
      await authenticatedApiFailure.getAggregateFrontendApi({
        aggregateId,
        aggregateName: 'account',
        frontendName: 'dashboard',
        aggregateFrontendLock,
      });
    const serviceApiFailure =
      await authenticatedApiFailure.getServiceFrontendApi({
        serviceName: 'products',
        frontendName: 'catalog',
        serviceFrontendLock,
      });

    expect(
      Object.getOwnPropertyNames(AggregateFrontendApiFailure.prototype)
        .filter(name => name !== 'constructor')
        .toSorted(),
    ).toEqual(
      Object.getOwnPropertyNames(AggregateFrontendApi.prototype)
        .filter(name => name !== 'constructor')
        .toSorted(),
    );
    expect(
      Object.getOwnPropertyNames(ServiceFrontendApiFailure.prototype)
        .filter(name => name !== 'constructor')
        .toSorted(),
    ).toEqual(
      Object.getOwnPropertyNames(ServiceFrontendApi.prototype)
        .filter(name => name !== 'constructor')
        .toSorted(),
    );

    const aggregateState = await aggregateApiFailure.getState({
      args: [],
      traceContext: null,
    });
    const serviceTicket = await serviceApiFailure.createWebSocketTicket({
      args: [],
      traceContext: null,
    });
    const replayed = [
      await Effect.runPromise(
        decodeRpc(await authenticatedApiFailure.getAuthentication()).pipe(
          Effect.flip,
        ),
      ),
      await Effect.runPromise(
        decodeRpc(await aggregateApiFailure.getAdmission()).pipe(Effect.flip),
      ),
      await Effect.runPromise(
        decodeRpc(aggregateState.result).pipe(Effect.flip),
      ),
      await Effect.runPromise(
        decodeRpc(await serviceApiFailure.getAdmission()).pipe(Effect.flip),
      ),
      await Effect.runPromise(
        decodeRpc(serviceTicket.result).pipe(Effect.flip),
      ),
    ];

    for (const replayedFailure of replayed) {
      expect(replayedFailure).toMatchObject({
        code: 'user-authentication-failed',
        status: 401,
      });
    }
    expect(aggregateState.link).toBe(null);
    expect(serviceTicket.link).toBe(null);
    expect(getSystemWorker).not.toHaveBeenCalled();
  });
});
