import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { EitherSchema } from '@zerospin/core/utils/encodeRpc';
import type * as Capnweb from 'capnweb';
import { Effect, Either, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedWranglerFn } from './seedWranglerFn.js';

const {
  disposeMock,
  finalizeServiceCommandsMock,
  getSystemApiMock,
  loadEnvMock,
  loadSeedsFnMock,
  loadZerospinConfigFnMock,
  newHttpBatchRpcSessionMock,
} = vi.hoisted(() => {
  const finalizeServiceCommandsMock = vi.fn();
  const getSystemApiMock = vi.fn(() => ({
    finalizeServiceCommands: finalizeServiceCommandsMock,
  }));
  const disposeMock = vi.fn();
  const newHttpBatchRpcSessionMock = vi.fn(() => ({
    getSystemApi: getSystemApiMock,
    [Symbol.dispose]: disposeMock,
  }));
  return {
    disposeMock,
    finalizeServiceCommandsMock,
    getSystemApiMock,
    loadEnvMock: vi.fn(),
    loadSeedsFnMock: vi.fn(),
    loadZerospinConfigFnMock: vi.fn(),
    newHttpBatchRpcSessionMock,
  };
});

vi.mock('capnweb', async importOriginal => {
  const actual = await importOriginal<typeof Capnweb>();
  return {
    ...actual,
    newHttpBatchRpcSession: newHttpBatchRpcSessionMock,
  };
});

vi.mock('dotenv', () => ({
  config: loadEnvMock,
}));

vi.mock('../deploy/loadSeedsFn.js', () => ({
  loadSeedsFn: loadSeedsFnMock,
}));

vi.mock('../deploy/loadZerospinConfigFn.js', () => ({
  loadZerospinConfigFn: loadZerospinConfigFnMock,
}));

describe('seedWranglerFn', () => {
  const originalSecretKey = process.env['ZEROSPIN_SECRET_KEY'];
  const originalWorkerUrl = process.env['ZEROSPIN_WRANGLER_API_URL'];

  beforeEach(() => {
    process.env['ZEROSPIN_SECRET_KEY'] = 'sk_live_project';
    process.env['ZEROSPIN_WRANGLER_API_URL'] =
      'https://red-rope-parking.example.workers.dev';
    disposeMock.mockReset();
    finalizeServiceCommandsMock.mockReset();
    getSystemApiMock.mockClear();
    loadEnvMock.mockReset();
    loadSeedsFnMock.mockReset();
    loadSeedsFnMock.mockReturnValue(
      Effect.succeed([
        {
          id: 'cmd_metro_1',
          commandName: 'createMetro',
          payload: { id: 'mtr_1', name: 'Chicago' },
          version: '1.0.0',
          systemVersion: '1.0.0',
          commandType: 'service',
          serviceName: 'app',
        },
        {
          id: 'cmd_metro_2',
          commandName: 'createMetro',
          payload: { id: 'mtr_2', name: 'Dallas' },
          version: '1.0.0',
          systemVersion: '1.0.0',
          commandType: 'service',
          serviceName: 'app',
        },
      ]),
    );
    loadZerospinConfigFnMock.mockReset();
    loadZerospinConfigFnMock.mockReturnValue(
      Effect.succeed({
        entry: 'src/system.ts',
        environmentId: 'dev',
        env: null,
        seeds: {
          dev: 'src/seeds.dev.ts',
          production: 'src/seeds.production.ts',
        },
      }),
    );
    newHttpBatchRpcSessionMock.mockClear();
  });

  afterEach(() => {
    if (originalSecretKey === undefined) {
      delete process.env['ZEROSPIN_SECRET_KEY'];
    } else {
      process.env['ZEROSPIN_SECRET_KEY'] = originalSecretKey;
    }
    if (originalWorkerUrl === undefined) {
      delete process.env['ZEROSPIN_WRANGLER_API_URL'];
    } else {
      process.env['ZEROSPIN_WRANGLER_API_URL'] = originalWorkerUrl;
    }
  });

  it('submits all production service seeds as one finalization operation', async () => {
    finalizeServiceCommandsMock.mockResolvedValue({
      result: Schema.encodeUnknownSync(EitherSchema)(
        Either.right({
          executed: [{ id: 'cmd_metro_1' }, { id: 'cmd_metro_2' }],
          failed: [],
        }),
      ),
      link: null,
    });

    const result = await Effect.runPromise(
      seedWranglerFn({
        environmentId: 'production',
        wrangler: true,
      }).pipe(Effect.provide(AsyncLive)),
    );

    expect(loadSeedsFnMock).toHaveBeenCalledWith(
      expect.objectContaining({ environmentId: 'production' }),
    );
    expect(getSystemApiMock).toHaveBeenCalledWith({
      zerospinSecretKey: 'sk_live_project',
    });
    expect(finalizeServiceCommandsMock).toHaveBeenCalledTimes(1);
    expect(finalizeServiceCommandsMock).toHaveBeenCalledWith({
      traceContext: null,
      args: [
        {
          serviceName: 'app',
          commands: expect.arrayContaining([
            expect.objectContaining({ id: 'cmd_metro_1' }),
            expect.objectContaining({ id: 'cmd_metro_2' }),
          ]),
        },
      ],
    });
    expect(result).toEqual({
      workerUrl: 'https://red-rope-parking.example.workers.dev',
      seedsLoadedCount: 2,
      seedCommandsFinalized: 2,
    });
    expect(disposeMock).toHaveBeenCalledOnce();
  });

  it('fails the one-shot seed command when any finalization fails', async () => {
    finalizeServiceCommandsMock.mockResolvedValue({
      result: Schema.encodeUnknownSync(EitherSchema)(
        Either.right({
          executed: [{ id: 'cmd_metro_1' }],
          failed: [{ id: 'cmd_metro_2' }],
        }),
      ),
      link: null,
    });

    const error = await Effect.runPromise(
      seedWranglerFn({
        environmentId: 'production',
        wrangler: true,
      }).pipe(Effect.provide(AsyncLive), Effect.flip),
    );

    expect(error).toMatchObject({
      code: 'zerospin-seed-commands-failed',
      extra: {
        seedsLoadedCount: 2,
        seedCommandsFinalized: 1,
      },
    });
    expect(finalizeServiceCommandsMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a hosted or non-workers.dev URL before loading seed config', async () => {
    process.env['ZEROSPIN_WRANGLER_API_URL'] = 'https://api.zerospin.dev';

    const error = await Effect.runPromise(
      seedWranglerFn({
        environmentId: 'production',
        wrangler: true,
      }).pipe(Effect.provide(AsyncLive), Effect.flip),
    );

    expect(error).toMatchObject({
      code: 'zerospin-seed-worker-url-invalid',
    });
    expect(loadZerospinConfigFnMock).not.toHaveBeenCalled();
    expect(loadSeedsFnMock).not.toHaveBeenCalled();
    expect(newHttpBatchRpcSessionMock).not.toHaveBeenCalled();
  });
});
