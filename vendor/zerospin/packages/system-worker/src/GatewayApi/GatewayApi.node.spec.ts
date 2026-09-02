import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { Effect, Result } from 'effect';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeSystemRuntime } from '../makeSystemRuntime.js';
import { SystemApi } from '../SystemApi/SystemApi.js';
import { SystemApiFailure } from '../SystemApi/SystemApiFailure/SystemApiFailure.js';

import { GatewayApi } from './GatewayApi.js';

const { appendTelemetryBatch, getSystemLogRepoByName } = vi.hoisted(() => ({
  appendTelemetryBatch: vi.fn(),
  getSystemLogRepoByName: vi.fn(),
}));

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {},
  RpcTarget: class {},
  WorkerEntrypoint: class {},
  env: {
    SYSTEM_LOG_REPO: { getByName: getSystemLogRepoByName },
    ZEROSPIN_PUBLISHABLE_KEY: 'pk_test',
    ZEROSPIN_SECRET_KEY: 'sk_test',
    ZEROSPIN_SYSTEM_ID: 'sys_1',
  },
  exports: {},
}));

const runtime = makeSystemRuntime();

describe('GatewayApi', () => {
  beforeEach(() => {
    appendTelemetryBatch.mockReset();
    getSystemLogRepoByName.mockReset();
    getSystemLogRepoByName.mockReturnValue({ appendTelemetryBatch });
    appendTelemetryBatch.mockResolvedValue(encodeSuccess(undefined));
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('grants a static SystemApi for the configured secret key', async () => {
    const gateway = new GatewayApi({ runtime });

    const systemApi = await gateway.getSystemApi({
      zerospinSecretKey: 'sk_test',
    });
    const envelope = await systemApi.healthcheck({
      args: [],
      traceContext: null,
    });

    expect(systemApi).toBeInstanceOf(SystemApi);
    await expect(Effect.runPromise(decodeRpc(envelope.result))).resolves.toBe(
      'healthy',
    );
  });

  it('returns a failure capability for a rejected secret key', async () => {
    const gateway = new GatewayApi({ runtime });

    const systemApi = await gateway.getSystemApi({
      zerospinSecretKey: 'wrong',
    });
    const envelope = await systemApi.healthcheck({
      args: [],
      traceContext: null,
    });
    const result = await Effect.runPromise(
      decodeRpc(envelope.result).pipe(Effect.result),
    );

    expect(systemApi).toBeInstanceOf(SystemApiFailure);
    expect(Result.isFailure(result)).toBe(true);
    expect(appendTelemetryBatch).not.toHaveBeenCalled();
  });

  it('returns a failure capability for malformed SystemApi input', async () => {
    const gateway = new GatewayApi({ runtime });

    const systemApi = await Reflect.apply(gateway.getSystemApi, gateway, [
      { zerospinSecretKey: 'sk_test', unexpected: true },
    ]);
    const envelope = await systemApi.healthcheck({
      args: [],
      traceContext: null,
    });
    const result = await Effect.runPromise(
      decodeRpc(envelope.result).pipe(Effect.result),
    );

    expect(systemApi).toBeInstanceOf(SystemApiFailure);
    expect(Result.isFailure(result)).toBe(true);
  });
});
