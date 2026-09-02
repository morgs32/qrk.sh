import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { ZerospinError } from '@zerospin/error';
import { Effect, Result } from 'effect';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeSystemRuntime } from '../makeSystemRuntime.js';

import { SystemApi } from './SystemApi.js';
import { SystemApiFailure } from './SystemApiFailure/SystemApiFailure.js';

const { appendTelemetryBatch, getSystemLogRepoByName, getSystemRepoByName } =
  vi.hoisted(() => ({
    appendTelemetryBatch: vi.fn(),
    getSystemLogRepoByName: vi.fn(),
    getSystemRepoByName: vi.fn(),
  }));

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {},
  RpcTarget: class {},
  WorkerEntrypoint: class {},
  env: {
    SYSTEM_LOG_REPO: { getByName: getSystemLogRepoByName },
    SYSTEM_REPO: { getByName: getSystemRepoByName },
    ZEROSPIN_SYSTEM_ID: 'sys_1',
  },
  exports: {},
}));

const runtime = makeSystemRuntime();

describe('SystemApi', () => {
  beforeEach(() => {
    appendTelemetryBatch.mockReset();
    getSystemLogRepoByName.mockReset();
    getSystemRepoByName.mockReset();
    getSystemLogRepoByName.mockReturnValue({ appendTelemetryBatch });
    appendTelemetryBatch.mockResolvedValue(encodeSuccess(undefined));
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('returns the static healthcheck result and persists its completed root span', async () => {
    const api = new SystemApi({ systemId: 'sys_1', runtime });

    const envelope = await api.healthcheck({
      args: [],
      traceContext: {
        traceId: 'trc_caller',
        parentSpanId: 'spn_caller',
      },
    });

    await expect(Effect.runPromise(decodeRpc(envelope.result))).resolves.toBe(
      'healthy',
    );
    expect(appendTelemetryBatch).toHaveBeenCalledOnce();
    expect(
      appendTelemetryBatch.mock.calls[0]?.[0].batch.spans.at(-1),
    ).toMatchObject({
      name: 'SystemApi.healthcheck',
      parentSpanId: null,
      status: 'ok',
      attributes: { systemId: 'sys_1' },
    });
    expect(envelope.link).toMatchObject({
      priorTraceId: 'trc_caller',
      priorSpanId: 'spn_caller',
      kind: 'causedBy',
    });
  });

  it('rejects malformed healthcheck arguments before persisting telemetry', async () => {
    const api = new SystemApi({ systemId: 'sys_1', runtime });
    const envelope = await Reflect.apply(api.healthcheck, api, [
      { args: ['unexpected'], traceContext: null },
    ]);
    const result = await Effect.runPromise(
      decodeRpc(envelope.result).pipe(Effect.result),
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.code).toBe('system-api-arguments-invalid');
    }
    expect(envelope.link).toBe(null);
    expect(appendTelemetryBatch).not.toHaveBeenCalled();
  });

  it('reads Repo registrations directly from SystemRepo', async () => {
    const getRepoRegistrations = vi.fn(async () =>
      encodeSuccess([
        {
          repoType: 'SystemRepo',
          repoName: 'sys_1',
          tableNames: ['repoRegistrations'],
        },
      ]),
    );
    getSystemRepoByName.mockReturnValue({ getRepoRegistrations });
    const api = new SystemApi({ systemId: 'sys_1', runtime });

    const envelope = await api.getSystemRepos({
      args: [],
      traceContext: null,
    });

    await expect(
      Effect.runPromise(decodeRpc(envelope.result)),
    ).resolves.toEqual([
      {
        repoType: 'SystemRepo',
        repoName: 'sys_1',
        tableNames: ['repoRegistrations'],
      },
    ]);
    expect(getSystemRepoByName).toHaveBeenCalledWith('sys_1');
    expect(getRepoRegistrations).toHaveBeenCalledWith({
      repoType: 'SystemRepo',
    });
  });

  it('returns the captured failure from healthcheck without Repo work', async () => {
    const error = new ZerospinError({
      code: 'system-authentication-failed',
      message: 'The SystemApi capability could not be authenticated',
    });
    const api = new SystemApiFailure(error);

    const envelope = await api.healthcheck({ args: [], traceContext: null });
    const result = await Effect.runPromise(
      decodeRpc(envelope.result).pipe(Effect.result),
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toEqual(error);
    }
    expect(envelope.link).toBe(null);
    expect(getSystemRepoByName).not.toHaveBeenCalled();
    expect(appendTelemetryBatch).not.toHaveBeenCalled();
  });
});
