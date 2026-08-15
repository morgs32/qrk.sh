import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deployWranglerFn } from './deployWranglerFn.js';

const {
  compileSystemArtifactsMock,
  disposeGatewayMock,
  getProductionDeployApiMock,
  getReadinessMock,
  loadConfigMock,
  loadEnvMock,
  loadSystemFnMock,
  loadZerospinConfigMock,
  mkdtempMock,
  newSyncRpcSessionMock,
  randomBytesMock,
  randomUUIDMock,
  resolveMock,
  rmMock,
  spawnMock,
  writeFileMock,
} = vi.hoisted(() => ({
  compileSystemArtifactsMock: vi.fn(),
  disposeGatewayMock: vi.fn(),
  getProductionDeployApiMock: vi.fn(),
  getReadinessMock: vi.fn(),
  loadConfigMock: vi.fn(),
  loadEnvMock: vi.fn(),
  loadSystemFnMock: vi.fn(),
  loadZerospinConfigMock: vi.fn(),
  mkdtempMock: vi.fn(),
  newSyncRpcSessionMock: vi.fn(),
  randomBytesMock: vi.fn(),
  randomUUIDMock: vi.fn(),
  resolveMock: vi.fn(),
  rmMock: vi.fn(),
  spawnMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock('@zerospin/core/utils/newSyncRpcSession', () => ({
  newSyncRpcSession: newSyncRpcSessionMock,
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('node:crypto', () => ({
  randomBytes: randomBytesMock,
  randomUUID: randomUUIDMock,
}));

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();

  return {
    ...actual,
    default: {
      ...actual,
      mkdtemp: mkdtempMock,
      rm: rmMock,
      writeFile: writeFileMock,
    },
  };
});

vi.mock('node:module', () => ({
  createRequire: () => ({
    resolve: resolveMock,
  }),
}));

vi.mock('c12', () => ({
  loadConfig: loadConfigMock,
}));

vi.mock('dotenv', () => ({
  config: loadEnvMock,
}));

vi.mock('./loadZerospinConfigFn.js', () => ({
  loadZerospinConfigFn: loadZerospinConfigMock,
}));

vi.mock('./loadSystemFn.js', () => ({
  loadSystemFn: loadSystemFnMock,
}));

vi.mock('../artifacts/compileSystemArtifactsFn.js', () => ({
  compileSystemArtifactsFn: compileSystemArtifactsMock,
}));

describe('deployWranglerFn', () => {
  const originalPublishableKey = process.env['ZEROSPIN_PUBLISHABLE_KEY'];
  const originalSecretKey = process.env['ZEROSPIN_SECRET_KEY'];
  const originalApiUrl = process.env['ZEROSPIN_API_URL'];
  const originalNextPublicApiUrl = process.env['NEXT_PUBLIC_ZEROSPIN_API_URL'];

  beforeEach(() => {
    delete process.env['ZEROSPIN_PUBLISHABLE_KEY'];
    delete process.env['ZEROSPIN_SECRET_KEY'];
    process.env['ZEROSPIN_API_URL'] = 'https://api.zerospin.dev';
    process.env['NEXT_PUBLIC_ZEROSPIN_API_URL'] =
      'https://framework-specific.example.com';
    compileSystemArtifactsMock.mockReset();
    loadSystemFnMock.mockReset();
    loadSystemFnMock.mockReturnValue(Effect.succeed({}));
    compileSystemArtifactsMock.mockReturnValue(
      Effect.succeed({
        buildHash: 'b'.repeat(64),
        systemVersion: '1.0.0',
      }),
    );
    disposeGatewayMock.mockReset();
    getProductionDeployApiMock.mockReset();
    getProductionDeployApiMock.mockReturnValue({
      getReadiness: getReadinessMock,
    });
    getReadinessMock.mockReset();
    getReadinessMock.mockResolvedValue({ _tag: 'Right', right: undefined });
    loadConfigMock.mockReset();
    loadConfigMock.mockResolvedValue({
      config: {
        compatibility_date: '2026-07-22',
        name: 'production-test',
        vars: { ZEROSPIN_SYSTEM_ID: 'sys_production_test' },
      },
    });
    loadEnvMock.mockReset();
    loadZerospinConfigMock.mockReset();
    loadZerospinConfigMock.mockReturnValue(
      Effect.succeed({
        entry: 'src/system.ts',
        environmentId: 'dev',
        env: null,
        seeds: { dev: null, production: null },
      }),
    );
    mkdtempMock.mockReset();
    mkdtempMock.mockResolvedValue('/tmp/zerospin-wrangler-test');
    newSyncRpcSessionMock.mockReset();
    newSyncRpcSessionMock.mockReturnValue({
      getProductionDeployApi: getProductionDeployApiMock,
      [Symbol.dispose]: disposeGatewayMock,
    });
    randomBytesMock.mockReset();
    randomBytesMock
      .mockReturnValueOnce(Buffer.from('project-publishable-key'))
      .mockReturnValueOnce(Buffer.from('project-secret-key'));
    randomUUIDMock.mockReset();
    randomUUIDMock.mockReturnValue('clean-request-1');
    resolveMock.mockReset();
    resolveMock.mockImplementation((specifier: string) => {
      if (specifier === 'wrangler/package.json') {
        return '/project/node_modules/wrangler/package.json';
      }
      if (specifier === '@zerospin/production-worker/ProductionWorker') {
        return '/project/node_modules/@zerospin/production-worker/dist/ProductionWorker.js';
      }
      if (specifier.endsWith('/emptySeeds.js')) {
        return '/project/node_modules/@zerospin/production-worker/dist/emptySeeds.js';
      }
      return specifier;
    });
    rmMock.mockReset();
    rmMock.mockResolvedValue(undefined);
    spawnMock.mockReset();
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalPublishableKey === undefined) {
      delete process.env['ZEROSPIN_PUBLISHABLE_KEY'];
    } else {
      process.env['ZEROSPIN_PUBLISHABLE_KEY'] = originalPublishableKey;
    }
    if (originalSecretKey === undefined) {
      delete process.env['ZEROSPIN_SECRET_KEY'];
    } else {
      process.env['ZEROSPIN_SECRET_KEY'] = originalSecretKey;
    }
    if (originalApiUrl === undefined) {
      delete process.env['ZEROSPIN_API_URL'];
    } else {
      process.env['ZEROSPIN_API_URL'] = originalApiUrl;
    }
    if (originalNextPublicApiUrl === undefined) {
      delete process.env['NEXT_PUBLIC_ZEROSPIN_API_URL'];
    } else {
      process.env['NEXT_PUBLIC_ZEROSPIN_API_URL'] = originalNextPublicApiUrl;
    }
  });

  it('generates project-owned keys and exits before any deployment input is loaded', async () => {
    // A partial pair is unusable. Generate and print one complete replacement
    // pair without attempting to reuse or rotate anything remotely.
    process.env['ZEROSPIN_PUBLISHABLE_KEY'] = 'pk_live_unpaired';

    const result = await Effect.runPromise(
      deployWranglerFn({ clean: false }).pipe(Effect.provide(AsyncLive)),
    );

    expect(result).toEqual({
      status: 'keys-generated',
      envFilePath: expect.stringMatching(/\.env\.local$/),
      zerospinPublishableKey: expect.stringMatching(/^pk_live_/),
      zerospinSecretKey: expect.stringMatching(/^sk_live_/),
    });
    expect(loadEnvMock.mock.calls).toEqual([
      [{ path: path.join(process.cwd(), '.env.local') }],
      [{ path: path.join(process.cwd(), '.env') }],
    ]);
    expect(loadZerospinConfigMock).not.toHaveBeenCalled();
    expect(loadConfigMock).not.toHaveBeenCalled();
    expect(resolveMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(newSyncRpcSessionMock).not.toHaveBeenCalled();
  });

  it('deploys an existing project key pair through local Wrangler and waits for readiness', async () => {
    process.env['ZEROSPIN_PUBLISHABLE_KEY'] = 'pk_live_existing';
    process.env['ZEROSPIN_SECRET_KEY'] = 'sk_live_existing';

    // 1. The project config remains the source for the system entry and the
    //    authored Wrangler fields. The deployment path owns only its aliases,
    //    lifecycle variables, migration, metadata binding, and secrets file.
    loadZerospinConfigMock.mockReturnValue(
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
    loadConfigMock.mockResolvedValue({
      config: {
        name: 'production-test',
        compatibility_date: '2026-07-22',
        compatibility_flags: ['nodejs_compat'],
        alias: {
          authored: './src/authored.ts',
        },
        migrations: [
          {
            tag: 'authored-v1',
            new_sqlite_classes: ['AuthoredRepo'],
          },
        ],
        rules: [
          {
            type: 'Text',
            globs: ['**/*.txt'],
            fallthrough: false,
          },
        ],
        vars: {
          AUTHORED_VAR: 'preserved',
          CLERK_JWT_KEY: 'authored-stale-clerk-key',
          NEXT_PUBLIC_ZEROSPIN_API_URL:
            'https://framework-specific.example.com',
          ZEROSPIN_API_URL: 'https://api.zerospin.dev',
          ZEROSPIN_ENVIRONMENT: 'dev',
          ZEROSPIN_SYSTEM_ID: 'sys_production_test',
        },
      },
    });
    resolveMock.mockImplementation((specifier: string) => {
      if (specifier === 'wrangler/package.json') {
        return '/project/node_modules/wrangler/package.json';
      }
      if (specifier === '@zerospin/production-worker/ProductionWorker') {
        return '/project/node_modules/@zerospin/production-worker/dist/ProductionWorker.js';
      }
      if (specifier.endsWith('/emptySeeds.js')) {
        return '/project/node_modules/@zerospin/production-worker/dist/emptySeeds.js';
      }
      return specifier;
    });

    // 2. Wrangler is represented by a real event emitter and output streams so
    //    the production URL must come from Wrangler's own successful output.
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
      stderr,
      stdout,
    });
    spawnMock.mockReturnValue(child);

    const resultPromise = Effect.runPromise(
      deployWranglerFn({ clean: true }).pipe(Effect.provide(AsyncLive)),
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));

    stdout.write(
      'Uploaded production-test\nhttps://production-test.account.workers.dev\n',
    );
    child.emit('close', 0, null);

    await expect(resultPromise).resolves.toEqual({
      status: 'deployed',
      workerUrl: 'https://production-test.account.workers.dev',
      zerospinPublishableKey: 'pk_live_existing',
    });

    // 3. The generated production configuration preserves authored fields and
    //    installs the first production DO SystemRepo binding and migration
    //    authored by the project.
    const generatedConfigPath = path.join(
      '/tmp/zerospin-wrangler-test',
      'wrangler.json',
    );
    const secretsPath = path.join(
      '/tmp/zerospin-wrangler-test',
      'secrets.json',
    );
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [
        '/project/node_modules/wrangler/bin/wrangler.js',
        'deploy',
        '--config',
        generatedConfigPath,
        '--secrets-file',
        secretsPath,
      ],
      expect.objectContaining({
        cwd: process.cwd(),
        stdio: ['inherit', 'pipe', 'pipe'],
      }),
    );
    const wranglerEnvironment = spawnMock.mock.calls[0]?.[2]?.env;
    expect(wranglerEnvironment).not.toHaveProperty('ZEROSPIN_API_URL');
    expect(wranglerEnvironment).toHaveProperty(
      'NEXT_PUBLIC_ZEROSPIN_API_URL',
      'https://framework-specific.example.com',
    );
    expect(wranglerEnvironment).not.toHaveProperty('ZEROSPIN_PUBLISHABLE_KEY');
    expect(wranglerEnvironment).not.toHaveProperty('ZEROSPIN_SECRET_KEY');
    expect(wranglerEnvironment).not.toHaveProperty('CLERK_JWT_KEY');
    const generatedConfigWrite = writeFileMock.mock.calls.find(
      call => call[0] === generatedConfigPath,
    );
    const secretsWrite = writeFileMock.mock.calls.find(
      call => call[0] === secretsPath,
    );
    expect(generatedConfigWrite).toBeDefined();
    expect(secretsWrite).toBeDefined();
    const generatedConfig = JSON.parse(String(generatedConfigWrite?.[1]));
    const secrets = JSON.parse(String(secretsWrite?.[1]));
    expect(JSON.stringify(generatedConfig)).not.toContain(
      'SelfHostedZerospinApis',
    );
    expect(JSON.stringify(generatedConfig)).not.toContain('renamed_classes');
    expect(generatedConfig).toMatchObject({
      name: 'production-test',
      main: '/project/node_modules/@zerospin/production-worker/dist/ProductionWorker.js',
      compatibility_date: '2026-07-22',
      compatibility_flags: ['nodejs_compat'],
      alias: {
        authored: './src/authored.ts',
        system: path.resolve(process.cwd(), 'src/system.ts'),
        seeds:
          '/project/node_modules/@zerospin/production-worker/dist/emptySeeds.js',
      },
      migrations: [
        {
          tag: 'authored-v1',
          new_sqlite_classes: ['AuthoredRepo'],
        },
      ],
      rules: [
        {
          type: 'Text',
          globs: ['**/*.txt', '**/*.sql'],
          fallthrough: false,
        },
      ],
      vars: {
        AUTHORED_VAR: 'preserved',
        ZEROSPIN_CLEAN_REQUEST_ID: 'cln_clean-request-1',
        ZEROSPIN_ENVIRONMENT: 'production',
        ZEROSPIN_SYSTEM_ID: 'sys_production_test',
      },
      version_metadata: {
        binding: 'WORKER_VERSION_METADATA',
      },
    });
    expect(generatedConfig.vars).toHaveProperty(
      'NEXT_PUBLIC_ZEROSPIN_API_URL',
      'https://framework-specific.example.com',
    );
    expect(generatedConfig.vars).not.toHaveProperty('ZEROSPIN_API_URL');
    expect(generatedConfig.vars).not.toHaveProperty('CLERK_JWT_KEY');
    expect(secrets).toEqual({
      ZEROSPIN_PUBLISHABLE_KEY: 'pk_live_existing',
      ZEROSPIN_SECRET_KEY: 'sk_live_existing',
    });
    expect(randomBytesMock).not.toHaveBeenCalled();
    expect(randomUUIDMock).toHaveBeenCalledOnce();

    // 4. No hosted Zerospin URL reaches the generated files or the Wrangler
    //    process even when a poison hosted URL exists in the ambient process.
    expect(String(generatedConfigWrite?.[1])).not.toContain(
      process.env['ZEROSPIN_API_URL'],
    );
    expect(String(secretsWrite?.[1])).not.toContain(
      process.env['ZEROSPIN_API_URL'],
    );
    expect(JSON.stringify(wranglerEnvironment)).not.toContain(
      process.env['ZEROSPIN_API_URL'],
    );

    expect(newSyncRpcSessionMock).toHaveBeenCalledWith(
      'https://production-test.account.workers.dev',
    );
    expect(getProductionDeployApiMock).toHaveBeenCalledOnce();
    expect(getReadinessMock).toHaveBeenCalledOnce();
    expect(disposeGatewayMock).toHaveBeenCalledOnce();
    expect(rmMock).toHaveBeenCalledWith('/tmp/zerospin-wrangler-test', {
      recursive: true,
      force: true,
    });
  });

  it('retries only the locked readiness failures with a fresh Gateway session', async () => {
    process.env['ZEROSPIN_PUBLISHABLE_KEY'] = 'pk_live_existing';
    process.env['ZEROSPIN_SECRET_KEY'] = 'sk_live_existing';
    getReadinessMock
      .mockRejectedValueOnce(new TypeError('connection reset'))
      .mockResolvedValueOnce({
        _tag: 'Left',
        left: {
          cause: 'transient SystemRepo transport rejection',
          code: 'failed-to-get-readiness-rpc',
          extra: null,
          message: 'Failed to get readiness over SystemRepo RPC.',
          status: null,
        },
      })
      .mockResolvedValueOnce({
        _tag: 'Left',
        left: {
          cause: null,
          code: 'system-deploy-activating',
          extra: null,
          message: 'The selected deploy is still activating.',
          status: null,
        },
      })
      .mockResolvedValueOnce({
        _tag: 'Left',
        left: {
          cause: null,
          code: 'system-worker-not-active',
          extra: null,
          message: 'The executing Worker is not active.',
          status: null,
        },
      })
      .mockResolvedValueOnce({ _tag: 'Right', right: undefined });
    const stdout = new PassThrough();
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
      stderr: new PassThrough(),
      stdout,
    });
    spawnMock.mockReturnValue(child);

    const resultPromise = Effect.runPromise(
      deployWranglerFn({ clean: false }).pipe(Effect.provide(AsyncLive)),
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    vi.useFakeTimers();
    try {
      stdout.write('https://production-test.account.workers.dev\n');
      child.emit('close', 0, null);
      await vi.advanceTimersByTimeAsync(4_000);
      await expect(resultPromise).resolves.toMatchObject({
        status: 'deployed',
        workerUrl: 'https://production-test.account.workers.dev',
      });
    } finally {
      vi.useRealTimers();
    }

    expect(getReadinessMock).toHaveBeenCalledTimes(5);
    expect(newSyncRpcSessionMock).toHaveBeenCalledTimes(5);
    expect(getProductionDeployApiMock).toHaveBeenCalledTimes(5);
    expect(disposeGatewayMock).toHaveBeenCalledTimes(5);
  });

  it('stops after exactly 60 retryable readiness failures', async () => {
    process.env['ZEROSPIN_PUBLISHABLE_KEY'] = 'pk_live_existing';
    process.env['ZEROSPIN_SECRET_KEY'] = 'sk_live_existing';
    getReadinessMock.mockResolvedValue({
      _tag: 'Left',
      left: {
        cause: null,
        code: 'system-deploy-activating',
        extra: null,
        message: 'The selected deploy is still activating.',
        status: null,
      },
    });
    const stdout = new PassThrough();
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
      stderr: new PassThrough(),
      stdout,
    });
    spawnMock.mockReturnValue(child);

    const resultPromise = Effect.runPromise(
      deployWranglerFn({ clean: false }).pipe(
        Effect.provide(AsyncLive),
        Effect.either,
      ),
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    vi.useFakeTimers();
    try {
      stdout.write('https://production-test.account.workers.dev\n');
      child.emit('close', 0, null);
      await vi.advanceTimersByTimeAsync(59_000);
      await expect(resultPromise).resolves.toMatchObject({
        _tag: 'Left',
        left: { code: 'zerospin-wrangler-worker-not-ready' },
      });
    } finally {
      vi.useRealTimers();
    }

    expect(getReadinessMock).toHaveBeenCalledTimes(60);
    expect(newSyncRpcSessionMock).toHaveBeenCalledTimes(60);
    expect(disposeGatewayMock).toHaveBeenCalledTimes(60);
  });

  it('propagates a terminal readiness error without retrying', async () => {
    process.env['ZEROSPIN_PUBLISHABLE_KEY'] = 'pk_live_existing';
    process.env['ZEROSPIN_SECRET_KEY'] = 'sk_live_existing';
    getReadinessMock.mockResolvedValueOnce({
      _tag: 'Left',
      left: {
        cause: 'persisted deployment failure',
        code: 'system-deploy-failed',
        extra: null,
        message: 'The selected deploy failed.',
        status: null,
      },
    });
    const stdout = new PassThrough();
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
      stderr: new PassThrough(),
      stdout,
    });
    spawnMock.mockReturnValue(child);

    const resultPromise = Effect.runPromise(
      deployWranglerFn({ clean: false }).pipe(
        Effect.provide(AsyncLive),
        Effect.either,
      ),
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    stdout.write('https://production-test.account.workers.dev\n');
    child.emit('close', 0, null);

    await expect(resultPromise).resolves.toMatchObject({
      _tag: 'Left',
      left: {
        cause: 'persisted deployment failure',
        code: 'system-deploy-failed',
      },
    });
    expect(getReadinessMock).toHaveBeenCalledOnce();
    expect(newSyncRpcSessionMock).toHaveBeenCalledOnce();
    expect(disposeGatewayMock).toHaveBeenCalledOnce();
  });
});
