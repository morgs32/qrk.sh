import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { ZerospinError } from '@zerospin/error';
import { Effect, Result } from 'effect';
import { system } from 'system';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeSystemRuntime } from '../makeSystemRuntime.js';

import { ServiceFrontendApi } from './ServiceFrontendApi.js';
import { ServiceFrontendApiFailure } from './ServiceFrontendApiFailure/ServiceFrontendApiFailure.js';

const {
  appendTelemetryBatch,
  getFrontendVersionedServiceRepoByName,
  getState,
  getSystemLogRepoByName,
  flush,
} = vi.hoisted(() => ({
  appendTelemetryBatch: vi.fn(),
  getFrontendVersionedServiceRepoByName: vi.fn(),
  getState: vi.fn(),
  getSystemLogRepoByName: vi.fn(),
  flush: vi.fn(),
}));

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {},
  RpcTarget: class {},
  WorkerEntrypoint: class {},
  env: {
    SERVICE_ADMITTED_CHAIN: {
      getByName: () => ({
        getBaseServiceVersion: async () => encodeSuccess('1.0.0'),
        serviceFanoutQueue: Promise.resolve({
          getPage: async () => encodeSuccess({ rows: [], lastIndex: 1 }),
        }),
      }),
    },
    VERSIONED_SERVICE_REPO: {
      getByName: () => ({ flush }),
    },
    FRONTEND_VERSIONED_SERVICE_REPO: {
      getByName: getFrontendVersionedServiceRepoByName,
    },
    SYSTEM_LOG_REPO: { getByName: getSystemLogRepoByName },
    ZEROSPIN_SYSTEM_ID: 'sys_1',
  },
  exports: {},
}));

const { serviceFrontendLock } = makeFrontendControllerSpec(
  system.services.app['1.0.0'].frontends.products.controller,
);
const runtime = makeSystemRuntime();

describe('ServiceFrontendApi', () => {
  beforeEach(() => {
    appendTelemetryBatch.mockReset();
    getFrontendVersionedServiceRepoByName.mockReset();
    getState.mockReset();
    getSystemLogRepoByName.mockReset();
    flush.mockReset();
    flush.mockResolvedValue(encodeSuccess(undefined));
    getFrontendVersionedServiceRepoByName.mockReturnValue({
      getState,
    });
    getSystemLogRepoByName.mockReturnValue({ appendTelemetryBatch });
    getState.mockResolvedValue(
      encodeSuccess({
        serviceName: 'app',
        userId: 'user_1',
        systemId: 'sys_1',
        frontendName: 'products',
        serviceVersion: '1.0.0',
        serviceIndex: 1,
        resources: [],
      }),
    );
    appendTelemetryBatch.mockResolvedValue(encodeSuccess(undefined));
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('returns a published versioned service snapshot', async () => {
    const api = new ServiceFrontendApi({
      authResults: {
        userId: 'user_1',
        frontendName: 'products',
        serviceFrontendLock,
        serviceName: 'app',
        serviceVersion: '1.0.0',
        systemId: 'sys_1',
      },
      runtime,
    });

    const envelope = await api.getState({
      args: [],
      traceContext: { traceId: 'trc_caller', parentSpanId: 'spn_caller' },
    });

    await expect(
      Effect.runPromise(decodeRpc(envelope.result)),
    ).resolves.toMatchObject({
      serviceName: 'app',
      frontendName: 'products',
      serviceIndex: 1,
      serviceVersion: '1.0.0',
    });
    expect(flush).toHaveBeenCalledWith(1);
    expect(getState).toHaveBeenCalledWith({
      serviceName: 'app',
      frontendName: 'products',
      userId: 'user_1',
    });
    expect(appendTelemetryBatch).toHaveBeenCalledOnce();
    expect(envelope.link).toMatchObject({
      priorTraceId: 'trc_caller',
      priorSpanId: 'spn_caller',
      kind: 'causedBy',
    });
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
    expect(getFrontendVersionedServiceRepoByName).not.toHaveBeenCalled();
    expect(appendTelemetryBatch).not.toHaveBeenCalled();
  });
});
