import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { ZerospinError } from '@zerospin/error';
import { Effect, Result } from 'effect';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeSystemRuntime } from '../makeSystemRuntime.js';

import { AggregateFrontendApi } from './AggregateFrontendApi.js';
import { AggregateFrontendApiFailure } from './AggregateFrontendApiFailure/AggregateFrontendApiFailure.js';

const {
  appendTelemetryBatch,
  executeServiceQuery,
  getMaterializedServiceRepoByName,
  getSystemLogRepoByName,
} = vi.hoisted(() => ({
  appendTelemetryBatch: vi.fn(),
  executeServiceQuery: vi.fn(),
  getMaterializedServiceRepoByName: vi.fn(),
  getSystemLogRepoByName: vi.fn(),
}));

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {},
  RpcTarget: class {},
  WorkerEntrypoint: class {},
  env: {
    MATERIALIZED_SERVICE_REPO: { getByName: getMaterializedServiceRepoByName },
    SYSTEM_LOG_REPO: { getByName: getSystemLogRepoByName },
    ZEROSPIN_SYSTEM_ID: 'sys_1',
  },
  exports: {},
}));

const aggregateFrontendLock = {
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
    getMaterializedServiceRepoByName.mockReset();
    getSystemLogRepoByName.mockReset();
    getMaterializedServiceRepoByName.mockReturnValue({ executeServiceQuery });
    getSystemLogRepoByName.mockReturnValue({ appendTelemetryBatch });
    executeServiceQuery.mockResolvedValue(encodeSuccess({ count: 2 }));
    appendTelemetryBatch.mockResolvedValue(encodeSuccess(undefined));
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('executes a frontend-bound service query directly through MaterializedServiceRepo', async () => {
    const api = new AggregateFrontendApi({
      authResults: {
        aggregateId: 'acct_1',
        aggregateName: 'shopping',
        userId: 'user_1',
        frontendName: 'web',
        aggregateFrontendLock,
        systemId: 'sys_1',
      },
      runtime,
    });

    const envelope = await api.executeServiceQuery({
      args: [
        { serviceName: 'products', queryName: 'list', params: { limit: 2 } },
      ],
      traceContext: null,
    });

    await expect(
      Effect.runPromise(decodeRpc(envelope.result)),
    ).resolves.toEqual({ count: 2 });
    expect(getMaterializedServiceRepoByName).toHaveBeenCalledWith(
      'matsvcrepo_sys_1/products',
    );
    expect(executeServiceQuery).toHaveBeenCalledWith({
      serviceName: 'products',
      queryName: 'list',
      params: { limit: 2 },
    });
    expect(appendTelemetryBatch).toHaveBeenCalledOnce();
  });

  it('rejects malformed query arguments before any Repo call', async () => {
    const api = new AggregateFrontendApi({
      authResults: {
        aggregateId: 'acct_1',
        aggregateName: 'shopping',
        userId: 'user_1',
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
    expect(getMaterializedServiceRepoByName).not.toHaveBeenCalled();
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
      args: [{ serviceName: 'products', queryName: 'list', params: null }],
      traceContext: null,
    });
    const result = await Effect.runPromise(
      decodeRpc(envelope.result).pipe(Effect.result),
    );

    expect(Result.isFailure(result)).toBe(true);
    expect(getMaterializedServiceRepoByName).not.toHaveBeenCalled();
    expect(appendTelemetryBatch).not.toHaveBeenCalled();
  });
});
