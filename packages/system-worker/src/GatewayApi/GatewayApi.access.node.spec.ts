import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import { ZerospinError } from '@zerospin/error';
import { newHttpBatchRpcResponse } from 'capnweb';
import { Effect } from 'effect';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { makeSystemRuntime } from '../makeSystemRuntime.js';

import { GatewayApi } from './GatewayApi.js';

const {
  authenticateAggregate,
  authenticateService,
  authorizeAggregate,
  authorizeService,
  execute,
} = vi.hoisted(() => ({
  authenticateAggregate: vi.fn(),
  authenticateService: vi.fn(),
  authorizeAggregate: vi.fn(),
  authorizeService: vi.fn(),
  execute: vi.fn(),
}));
vi.mock('cloudflare:workers', () => ({
  env: {
    ZEROSPIN_SYSTEM_ID: 'sys_test',
    ZEROSPIN_PUBLISHABLE_KEY: 'pk_test',
    ZEROSPIN_SECRET_KEY: 'sk_test',
  },
}));
vi.mock('./getSystemApi/getSystemApi.js', () => ({
  getSystemApi: () => Effect.die('System access is outside this test'),
}));
vi.mock('config', () => ({
  default: {
    system: {
      name: 'test',
      aggregates: { shopper: { '1.0.0': {} } },
      services: { catalog: { '1.0.0': {} } },
    },
  },
}));
vi.mock('../authenticateAggregate/authenticateAggregate.js', () => ({
  authenticateAggregate,
}));
vi.mock('../authenticateService/authenticateService.js', () => ({
  authenticateService,
}));
vi.mock('../authorizeAggregateFrontend/authorizeAggregateFrontend.js', () => ({
  authorizeAggregateFrontend: authorizeAggregate,
}));
vi.mock('../authorizeServiceFrontend/authorizeServiceFrontend.js', () => ({
  authorizeServiceFrontend: authorizeService,
}));
vi.mock('../AggregateFrontendApi/AggregateFrontendApi.js', async () => {
  const { RpcTarget } = await import('capnweb');
  const { encodeSuccess } = await import('@zerospin/core/utils/encodeSuccess');
  return {
    AggregateFrontendApi: class extends RpcTarget {
      constructor(private readonly props: { authResults: unknown }) {
        super();
      }
      getState() {
        execute();
        return { result: encodeSuccess(this.props.authResults), link: null };
      }
    },
  };
});
vi.mock('../ServiceFrontendApi/ServiceFrontendApi.js', async () => {
  const { RpcTarget } = await import('capnweb');
  const { encodeSuccess } = await import('@zerospin/core/utils/encodeSuccess');
  return {
    ServiceFrontendApi: class extends RpcTarget {
      constructor(private readonly props: { authResults: unknown }) {
        super();
      }
      getState() {
        execute();
        return { result: encodeSuccess(this.props.authResults), link: null };
      }
    },
  };
});
const runtime = makeSystemRuntime();
const gateway = new GatewayApi({ runtime });
const aggregateRequest = {
  publishableKey: 'pk_test',
  systemName: 'test',
  name: 'shopper',
  version: '1.0.0',
};
const serviceRequest = { ...aggregateRequest, name: 'catalog' };
const aggregateFrontendLock = {
  systemName: 'test',
  frontendName: 'main',
  authentication: { authenticationJsonSchema: {} },
  models: {},
  contracts: {},
};
const serviceFrontendLock = {
  systemName: 'test',
  frontendName: 'main',
  authentication: { authenticationJsonSchema: {} },
  models: {},
};
const aggregateAuthorization = { frontendName: 'main', aggregateFrontendLock };
const serviceAuthorization = { frontendName: 'main', serviceFrontendLock };
const aggregateClaims = { aggregateId: 'acct_test', userId: 'usr_test' };
const serviceClaims = { userId: 'usr_test' };

beforeEach(() => {
  vi.clearAllMocks();
  authenticateAggregate.mockImplementation(() =>
    Effect.succeed({
      authentication: aggregateClaims,
      selectionPath: '/usr_test',
    }),
  );
  authenticateService.mockImplementation(() =>
    Effect.succeed({
      authentication: serviceClaims,
      selectionPath: '/usr_test',
    }),
  );
  authorizeAggregate.mockImplementation(props =>
    Effect.succeed({
      ...props,
      frontendSpec: {
        kind: 'aggregate',
        systemName: 'test',
        aggregateName: 'shopper',
        aggregateVersion: '1.0.0',
        name: props.frontendName,
      },
    }),
  );
  authorizeService.mockImplementation(props =>
    Effect.succeed({
      ...props,
      frontendSpec: {
        kind: 'service',
        systemName: 'test',
        serviceName: 'catalog',
        serviceVersion: '1.0.0',
        name: props.frontendName,
      },
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => runtime.dispose());

describe('aggregate and service RPC access', () => {
  it('pipelines both complete capability chains in one HTTP batch', async () => {
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      newHttpBatchRpcResponse(new Request(input, init), gateway),
    );
    vi.stubGlobal('fetch', fetch);
    using rpc = newSyncRpcSession<GatewayApi>('https://test.invalid/rpc');
    const aggregate = rpc
      .aggregate(aggregateRequest)
      .authenticate({ signature: 'aggregate-proof' })
      .authorize(aggregateAuthorization);
    const service = rpc
      .service(serviceRequest)
      .authenticate({ signature: 'service-proof' })
      .authorize(serviceAuthorization);
    const [a, s] = await Promise.all([
      aggregate.getState({
        args: [{ outstandingCommandIds: [] }],
        traceContext: null,
      }),
      service.getState({ args: [], traceContext: null }),
    ]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(a.result).toMatchObject({
      _tag: 'Success',
      success: {
        aggregateName: 'shopper',
        aggregateVersion: '1.0.0',
        authentication: aggregateClaims,
      },
    });
    expect(s.result).toMatchObject({
      _tag: 'Success',
      success: {
        serviceName: 'catalog',
        serviceVersion: '1.0.0',
        authentication: serviceClaims,
      },
    });
    expect(authenticateAggregate).toHaveBeenCalledWith({
      systemName: 'test',
      aggregateName: 'shopper',
      aggregateVersion: '1.0.0',
      signature: 'aggregate-proof',
    });
    expect(authorizeAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: 'acct_test',
        authentication: aggregateClaims,
      }),
    );
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      { ...aggregateRequest, publishableKey: 'wrong' },
      'production-api-key-invalid',
    ],
    [
      { ...aggregateRequest, systemName: 'wrong' },
      'authentication-system-name-mismatch',
    ],
    [
      { ...aggregateRequest, version: '2.0.0' },
      'authentication-aggregate-unavailable',
    ],
  ])(
    'propagates gateway rejection without authentication',
    async (request, code) => {
      const aggregate = await gateway.aggregate(request);
      const access = await aggregate.authenticate({ signature: 'proof' });
      const frontend = await access.authorize(aggregateAuthorization);
      const response = await frontend.getState({
        args: [{ outstandingCommandIds: [] }],
        traceContext: null,
      });
      expect(response.result).toMatchObject({
        _tag: 'Failure',
        failure: { code },
      });
      expect(authenticateAggregate).not.toHaveBeenCalled();
      expect(authorizeAggregate).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it('retains authentication failure through a pipelined service call', async () => {
    authenticateService.mockReturnValue(
      Effect.fail(
        new ZerospinError({
          code: 'bad-signature',
          message: 'Rejected signature',
        }),
      ),
    );
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      newHttpBatchRpcResponse(new Request(input, init), gateway),
    );
    using rpc = newSyncRpcSession<GatewayApi>('https://test.invalid/rpc');
    const result = await rpc
      .service(serviceRequest)
      .authenticate({ signature: 'bad' })
      .authorize(serviceAuthorization)
      .getState({ args: [], traceContext: null });
    expect(result.result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'bad-signature' },
    });
    expect(authorizeService).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects injected identity fields and never exposes bound access data', async () => {
    const aggregate = await gateway.aggregate(aggregateRequest);
    const access = await aggregate.authenticate({ signature: 'proof' });
    expect(Object.keys(access)).toEqual([]);
    const injectedRequest = {
      ...aggregateAuthorization,
      authentication: { userId: 'attacker' },
      aggregateId: 'acct_other',
    };
    const frontend = await access.authorize(injectedRequest);
    const result = await frontend.getState({
      args: [{ outstandingCommandIds: [] }],
      traceContext: null,
    });
    expect(result.result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-authorization-arguments-invalid' },
    });
    expect(authorizeAggregate).not.toHaveBeenCalled();
  });

  it('checks authorization again for each call without authenticating again', async () => {
    const service = await gateway.service(serviceRequest);
    const access = await service.authenticate({ signature: 'proof' });
    await access.authorize(serviceAuthorization);
    authorizeService.mockReturnValue(
      Effect.fail(
        new ZerospinError({ code: 'membership-revoked', message: 'Revoked' }),
      ),
    );
    const frontend = await access.authorize(serviceAuthorization);
    const result = await frontend.getState({ args: [], traceContext: null });
    expect(result.result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'membership-revoked' },
    });
    expect(authenticateService).toHaveBeenCalledOnce();
    expect(authorizeService).toHaveBeenCalledTimes(2);
  });

  it('rejects a different lock returned by authorization', async () => {
    authorizeAggregate.mockImplementation(props =>
      Effect.succeed({
        ...props,
        aggregateFrontendLock: {
          ...props.aggregateFrontendLock,
          frontendName: 'other',
        },
        frontendSpec: {
          kind: 'aggregate',
          systemName: 'test',
          aggregateName: 'shopper',
          aggregateVersion: '1.0.0',
          name: 'main',
        },
      }),
    );
    const aggregate = await gateway.aggregate(aggregateRequest);
    const access = await aggregate.authenticate({ signature: 'proof' });
    const frontend = await access.authorize(aggregateAuthorization);
    const result = await frontend.getState({
      args: [{ outstandingCommandIds: [] }],
      traceContext: null,
    });
    expect(result.result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-frontend-admission-target-mismatch' },
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
