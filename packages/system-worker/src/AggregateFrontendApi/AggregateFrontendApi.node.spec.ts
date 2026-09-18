import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import { SessionCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { ZerospinError } from '@zerospin/error';
import { Effect, Result, Schema } from 'effect';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeSystemRuntime } from '../makeSystemRuntime.js';

import { AggregateFrontendApi } from './AggregateFrontendApi.js';
import { AggregateFrontendApiFailure } from './AggregateFrontendApiFailure/AggregateFrontendApiFailure.js';

const {
  appendTelemetryBatch,
  executeServiceQuery,
  getVersionedServiceRepoByName,
  getSystemLogRepoByName,
} = vi.hoisted(() => ({
  appendTelemetryBatch: vi.fn(),
  executeServiceQuery: vi.fn(),
  getVersionedServiceRepoByName: vi.fn(),
  getSystemLogRepoByName: vi.fn(),
}));

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {},
  RpcTarget: class {},
  WorkerEntrypoint: class {},
  env: {
    SERVICE_ADMITTED_CHAIN: {
      getByName: () => ({
        getBaseServiceVersion: async () => ({
          _tag: 'Success',
          success: '1.0.0',
        }),
      }),
    },
    VERSIONED_SERVICE_REPO: {
      getByName: getVersionedServiceRepoByName,
    },
    SYSTEM_LOG_REPO: { getByName: getSystemLogRepoByName },
    ZEROSPIN_SYSTEM_ID: 'sys_1',
  },
  exports: {},
}));

const aggregateFrontendLock = {
  authentication: {
    authenticationJsonSchema: {},
  },
  systemName: 'shopping',
  frontendName: 'web',
  models: {},
  contracts: {},
} satisfies IFrontendControllerSpec['aggregateFrontendLock'];
const runtime = makeSystemRuntime();

describe('AggregateFrontendApi', () => {
  beforeEach(() => {
    appendTelemetryBatch.mockReset();
    executeServiceQuery.mockReset();
    getVersionedServiceRepoByName.mockReset();
    getSystemLogRepoByName.mockReset();
    getVersionedServiceRepoByName.mockReturnValue({
      executeServiceQuery,
    });
    getSystemLogRepoByName.mockReturnValue({ appendTelemetryBatch });
    executeServiceQuery.mockResolvedValue(encodeSuccess({ count: 2 }));
    appendTelemetryBatch.mockResolvedValue(encodeSuccess(undefined));
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('executes a frontend-bound service query directly through VersionedServiceRepo', async () => {
    const api = new AggregateFrontendApi({
      authResults: {
        authentication: { userId: 'user_1', aggregateId: 'acct_1' },
        aggregateId: 'acct_1',
        aggregateName: 'user',
        aggregateVersion: '1.0.0',
        selectionPath: createHref(RoutePattern.parse('/:userId'), {
          userId: 'user_1',
        }),
        frontendName: 'web',
        aggregateFrontendLock,
        systemId: 'sys_1',
      },
      runtime,
    });

    const envelope = await api.executeServiceQuery({
      args: [{ serviceName: 'app', queryName: 'getProducts', params: {} }],
      traceContext: null,
    });

    await expect(
      Effect.runPromise(decodeRpc(envelope.result)),
    ).resolves.toEqual({ count: 2 });
    expect(getVersionedServiceRepoByName).toHaveBeenCalledWith(
      'vsr_sys_1/app/1.0.0',
    );
    expect(executeServiceQuery).toHaveBeenCalledWith({
      serviceName: 'app',
      queryName: 'getProducts',
      params: {},
    });
    expect(appendTelemetryBatch).toHaveBeenCalledOnce();
  });

  it('rejects malformed query arguments before any Repo call', async () => {
    const api = new AggregateFrontendApi({
      authResults: {
        authentication: { userId: 'user_1', aggregateId: 'acct_1' },
        aggregateId: 'acct_1',
        aggregateName: 'user',
        aggregateVersion: '1.0.0',
        selectionPath: createHref(RoutePattern.parse('/:userId'), {
          userId: 'user_1',
        }),
        frontendName: 'web',
        aggregateFrontendLock,
        systemId: 'sys_1',
      },
      runtime,
    });
    const envelope = await Reflect.apply(api.executeServiceQuery, api, [
      { args: [], traceContext: null },
    ]);
    const result = await Effect.runPromise(
      decodeRpc(envelope.result).pipe(Effect.result),
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.code).toBe(
        'aggregate-frontend-api-arguments-invalid',
      );
    }
    expect(getVersionedServiceRepoByName).not.toHaveBeenCalled();
    expect(appendTelemetryBatch).not.toHaveBeenCalled();
  });

  it('rejects a pending occurrence created under different claims without rewriting it', async () => {
    const originalClaims = {
      userId: 'user_1',
      aggregateId: 'acct_1',
      issuedAt: '2026-09-18T12:00:00.000Z',
      level: '42',
    };
    const command = Schema.decodeUnknownSync(SessionCommandSchema)({
      id: 'cmd_claims082',
      commandName: 'createList',
      payload: '{}',
      contractVersion: '1.0.0',
      aggregateId: 'acct_1',
      aggregateName: 'user',
      systemName: 'shopping',
      sessionId: 'sesn_claims082',
      sessionIndex: 1,
      authentication: originalClaims,
      frontendName: 'web',
      pushIndex: null,
      chainedAt: '2026-09-18T12:00:00.000Z',
      delta: { inserted: [], updated: [], deleted: [], mutations: [] },
      failedAt: null,
      failure: null,
    });
    const api = new AggregateFrontendApi({
      authResults: {
        authentication: { ...originalClaims, level: '43' },
        aggregateId: 'acct_1',
        aggregateName: 'user',
        aggregateVersion: '1.0.0',
        selectionPath: createHref(RoutePattern.parse('/:userId'), {
          userId: 'user_1',
        }),
        frontendName: 'web',
        aggregateFrontendLock,
        systemId: 'sys_1',
      },
      runtime,
    });
    const envelope = await api.pushCommand({
      args: [{ command }],
      traceContext: null,
    });
    expect(envelope.result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-frontend-command-target-mismatch' },
    });
    expect(command.authentication).toEqual(originalClaims);
    expect(appendTelemetryBatch).not.toHaveBeenCalled();
  });

  it('returns a captured capability failure without Repo work', async () => {
    const api = new AggregateFrontendApiFailure(
      new ZerospinError({
        code: 'aggregate-frontend-authorization-failed',
        message: 'Aggregate frontend authorization failed',
      }),
    );

    const envelope = await api.executeServiceQuery({
      args: [{ serviceName: 'app', queryName: 'getProducts', params: null }],
      traceContext: null,
    });
    const result = await Effect.runPromise(
      decodeRpc(envelope.result).pipe(Effect.result),
    );

    expect(Result.isFailure(result)).toBe(true);
    expect(getVersionedServiceRepoByName).not.toHaveBeenCalled();
    expect(appendTelemetryBatch).not.toHaveBeenCalled();
  });
});
