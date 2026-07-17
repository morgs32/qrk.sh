import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { IDeploySeedCommand } from '@zerospin/core/contracts/types';
import type {
  IDeployConfig,
  ISystem,
  ISystemConfig,
} from '@zerospin/core/system/types';
import { EitherSchema } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError } from '@zerospin/error';
import type * as Capnweb from 'capnweb';
import { Cause, Effect, Either, Exit, Option, Schema } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deploySystemFn } from './deploySystemFn.js';

const zerospinApiUrl = 'https://api.example.com/';
const stubSystem = {
  name: 'test',
  version: '1.0.0',
  accountControllers: {},
  serviceControllers: {},
} as ISystem;

const { deploySystemWorker, dispose, getCliApi, newHttpBatchRpcSessionMock } =
  vi.hoisted(() => {
    const deploySystemWorker = vi.fn();
    const dispose = vi.fn();
    const getCliApi = vi.fn(() => ({
      deploySystemWorker,
    }));
    const newHttpBatchRpcSessionMock = vi.fn(() => ({
      getCliApi,
      [Symbol.dispose]: dispose,
    }));
    return {
      deploySystemWorker,
      dispose,
      getCliApi,
      newHttpBatchRpcSessionMock,
    };
  });

const { loadSeedsFnMock } = vi.hoisted(() => ({
  loadSeedsFnMock: vi.fn(() =>
    Effect.succeed([] as readonly IDeploySeedCommand[]),
  ),
}));

vi.mock('./loadSeedsFn.js', () => ({
  loadSeedsFn: Effect.fn('loadSeedsFn')(function* () {
    return yield* loadSeedsFnMock();
  }),
}));

vi.mock('capnweb', async importOriginal => {
  const mod = await importOriginal<typeof Capnweb>();
  return {
    ...mod,
    newHttpBatchRpcSession: newHttpBatchRpcSessionMock,
  };
});

function makeFileConfig(props?: {
  environmentId?: ISystemConfig['environmentId'];
  env?: Record<string, string>;
  seeds?: ISystemConfig['seeds'];
}): ISystemConfig {
  return {
    entry: 'src/system.ts',
    environmentId: props?.environmentId ?? 'dev',
    env: props?.env ?? null,
    seeds: props?.seeds ?? null,
  };
}

function makeDeployConfig(props?: {
  environmentId?: IDeployConfig['environmentId'];
  env?: Record<string, string>;
  seeds?: readonly IDeploySeedCommand[];
}): IDeployConfig {
  return {
    environmentId: props?.environmentId ?? 'dev',
    env: props?.env ?? null,
    seeds: props?.seeds ?? [],
  };
}

const deployWorkerResponse = {
  id: 'dep_1',
  cloudflareDeploymentId: 'b3ed9cf9',
  environmentId: 'dev',
  seedCommandsFinalized: 0,
} as const;

describe('deploySystemFn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the API key in the deploy RPC payload', async () => {
    deploySystemWorker.mockResolvedValue(
      Schema.encodeUnknownSync(EitherSchema)(
        Either.right(deployWorkerResponse),
      ),
    );

    await Effect.runPromise(
      deploySystemFn({
        clean: false,
        zerospinSecretKey: 'api_key_test_123',
        zerospinApiUrl,
        compiledSystemWorker: 'export default {};',
        environmentId: 'dev',
        system: stubSystem,
        config: makeFileConfig(),
      }).pipe(Effect.provide(AsyncLive)),
    );

    expect(newHttpBatchRpcSessionMock).toHaveBeenCalledWith(zerospinApiUrl);
    expect(getCliApi).toHaveBeenCalledWith({
      zerospinSecretKey: 'api_key_test_123',
    });
    expect(deploySystemWorker).toHaveBeenCalledWith({
      clean: false,
      script: 'export default {};',
      config: makeDeployConfig({ environmentId: 'dev' }),
      systemSpec: {
        systemName: 'test',
        version: '1.0.0',
        accountControllers: {},
        serviceControllers: {},
      },
    });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('includes the full deploy config in the deploy RPC payload', async () => {
    loadSeedsFnMock.mockReturnValueOnce(
      Effect.succeed([{ id: 'cmd_seed' }] as readonly IDeploySeedCommand[]),
    );
    deploySystemWorker.mockResolvedValue(
      Schema.encodeUnknownSync(EitherSchema)(
        Either.right(deployWorkerResponse),
      ),
    );

    await Effect.runPromise(
      deploySystemFn({
        clean: false,
        zerospinSecretKey: 'api_key_test_123',
        zerospinApiUrl,
        compiledSystemWorker: 'export default {};',
        environmentId: 'dev',
        system: stubSystem,
        config: makeFileConfig({
          env: { FOO: 'bar' },
          seeds: 'src/zerospin/seeds.ts',
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );

    expect(deploySystemWorker).toHaveBeenCalledWith({
      clean: false,
      script: 'export default {};',
      config: makeDeployConfig({
        environmentId: 'dev',
        env: { FOO: 'bar' },
        seeds: [{ id: 'cmd_seed' }],
      }),
      systemSpec: {
        systemName: 'test',
        version: '1.0.0',
        accountControllers: {},
        serviceControllers: {},
      },
    });
  });

  it('includes clean in the deploy RPC payload when true', async () => {
    deploySystemWorker.mockResolvedValue(
      Schema.encodeUnknownSync(EitherSchema)(
        Either.right(deployWorkerResponse),
      ),
    );

    await Effect.runPromise(
      deploySystemFn({
        clean: true,
        zerospinSecretKey: 'api_key_test_123',
        zerospinApiUrl,
        compiledSystemWorker: 'export default {};',
        environmentId: 'dev',
        system: stubSystem,
        config: makeFileConfig(),
      }).pipe(Effect.provide(AsyncLive)),
    );

    expect(deploySystemWorker).toHaveBeenCalledWith({
      clean: true,
      script: 'export default {};',
      config: makeDeployConfig({ environmentId: 'dev' }),
      systemSpec: {
        systemName: 'test',
        version: '1.0.0',
        accountControllers: {},
        serviceControllers: {},
      },
    });
  });

  it('maps fetch failures to deploy-api-unreachable with URL and local-dev hint', async () => {
    const fetchError = new TypeError('fetch failed', {
      cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3004'), {
        code: 'ECONNREFUSED',
      }),
    });
    deploySystemWorker.mockRejectedValue(fetchError);

    const exit = await Effect.runPromiseExit(
      deploySystemFn({
        clean: false,
        zerospinSecretKey: 'api_key_test_123',
        zerospinApiUrl: 'http://localhost:3004',
        compiledSystemWorker: 'export default {};',
        environmentId: 'dev',
        system: stubSystem,
        config: makeFileConfig(),
      }).pipe(Effect.provide(AsyncLive)),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    const failure = Cause.failureOption(exit.cause);
    expect(Option.isSome(failure)).toBe(true);
    const error = failure.value;
    expect(ZerospinError.isZerospinError(error)).toBe(true);
    if (!ZerospinError.isZerospinError(error)) {
      return;
    }
    expect(error.code).toBe('deploy-api-threw-exception');
    expect(error.message).toContain('http://localhost:3004');
    expect(error.message).toContain('fetch failed');
    expect(error.message).toContain('ECONNREFUSED');
    expect(error.cause).toContain('fetch failed');
    expect(error.cause).toContain('ECONNREFUSED');
    expect(error.extra).toEqual({ zerospinApiUrl: 'http://localhost:3004' });
  });

  it('returns deploy results from the API response', async () => {
    deploySystemWorker.mockResolvedValue(
      Schema.encodeUnknownSync(EitherSchema)(
        Either.right(deployWorkerResponse),
      ),
    );

    const result = await Effect.runPromise(
      deploySystemFn({
        clean: false,
        zerospinSecretKey: 'api_key_test_123',
        zerospinApiUrl,
        compiledSystemWorker: 'export default {};',
        environmentId: 'dev',
        system: stubSystem,
        config: makeFileConfig(),
      }).pipe(Effect.provide(AsyncLive)),
    );

    expect(result.cloudflareDeploymentId).toBe('b3ed9cf9');
    expect(result.seedCommandsFinalized).toBe(0);
    expect(result.seedsLoadedCount).toBe(0);
    expect(result.response).toEqual(deployWorkerResponse);
  });
});
