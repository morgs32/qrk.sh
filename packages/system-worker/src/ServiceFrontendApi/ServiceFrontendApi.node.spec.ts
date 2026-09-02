import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { ZerospinError } from '@zerospin/error';
import { Effect, Result } from 'effect';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeSystemRuntime } from '../makeSystemRuntime.js';

import { ServiceFrontendApi } from './ServiceFrontendApi.js';
import { ServiceFrontendApiFailure } from './ServiceFrontendApiFailure/ServiceFrontendApiFailure.js';

const {
  appendTelemetryBatch,
  getMaterializedServiceFrontendRepoByName,
  getState,
  getSystemLogRepoByName,
} = vi.hoisted(() => ({
  appendTelemetryBatch: vi.fn(),
  getMaterializedServiceFrontendRepoByName: vi.fn(),
  getState: vi.fn(),
  getSystemLogRepoByName: vi.fn(),
}));

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {},
  RpcTarget: class {},
  WorkerEntrypoint: class {},
  env: {
    MATERIALIZED_SERVICE_FRONTEND_REPO: { getByName: getMaterializedServiceFrontendRepoByName },
    SYSTEM_LOG_REPO: { getByName: getSystemLogRepoByName },
    ZEROSPIN_SYSTEM_ID: 'sys_1',
  },
  exports: {},
}));

const serviceFrontendLock = {
  systemName: 'shopping',
  frontendName: 'catalog',
  models: {},
} satisfies Extract<
  IFrontendControllerSpec,
  { kind: 'service' }
>['serviceFrontendLock'];
const runtime = makeSystemRuntime();

describe('ServiceFrontendApi', () => {
  beforeEach(() => {
    appendTelemetryBatch.mockReset();
    getMaterializedServiceFrontendRepoByName.mockReset();
    getState.mockReset();
    getSystemLogRepoByName.mockReset();
    getMaterializedServiceFrontendRepoByName.mockReturnValue({ getState });
    getSystemLogRepoByName.mockReturnValue({ appendTelemetryBatch });
    getState.mockResolvedValue(
      encodeSuccess({
        serviceName: 'products',
        userId: 'user_1',
        systemId: 'sys_1',
        systemVersion: '1.0.0',
        frontendName: 'catalog',
        frontendIndex: 1,
        resources: [],
      }),
    );
    appendTelemetryBatch.mockResolvedValue(encodeSuccess(undefined));
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('loads state directly from MaterializedServiceFrontendRepo', async () => {
    const api = new ServiceFrontendApi({
      authResults: {
        userId: 'user_1',
        frontendName: 'catalog',
        serviceFrontendLock,
        serviceName: 'products',
        systemId: 'sys_1',
      },
      runtime,
    });

    const envelope = await api.getState({ args: [], traceContext: null });

    await expect(
      Effect.runPromise(decodeRpc(envelope.result)),
    ).resolves.toMatchObject({
      serviceName: 'products',
      frontendName: 'catalog',
      frontendIndex: 1,
    });
    expect(getMaterializedServiceFrontendRepoByName).toHaveBeenCalledWith(
      'matsvcfrtrepo_sys_1/products/user_1/catalog',
    );
    expect(getState).toHaveBeenCalledWith({
      systemId: 'sys_1',
      serviceName: 'products',
      userId: 'user_1',
      frontendName: 'catalog',
    });
    expect(appendTelemetryBatch).toHaveBeenCalledOnce();
  });

  it('returns a captured capability failure without Repo work', async () => {
    const api = new ServiceFrontendApiFailure(
      new ZerospinError({
        code: 'service-frontend-authorization-failed',
        message: 'Service frontend authorization failed',
      }),
    );

    const envelope = await api.getState({ args: [], traceContext: null });
    const result = await Effect.runPromise(
      decodeRpc(envelope.result).pipe(Effect.result),
    );

    expect(Result.isFailure(result)).toBe(true);
    expect(getMaterializedServiceFrontendRepoByName).not.toHaveBeenCalled();
    expect(appendTelemetryBatch).not.toHaveBeenCalled();
  });
});
