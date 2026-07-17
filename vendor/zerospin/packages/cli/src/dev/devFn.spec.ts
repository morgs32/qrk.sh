import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect, Fiber } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { devFn } from './devFn.js';

const {
  fetchMock,
  loadEnvMock,
  loadConfigMock,
  loadZerospinConfigMock,
  randomUUIDMock,
  resolveMock,
  rmMock,
  spawnMock,
  writeFileMock,
} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  loadEnvMock: vi.fn(),
  loadConfigMock: vi.fn(),
  loadZerospinConfigMock: vi.fn(),
  randomUUIDMock: vi.fn(),
  resolveMock: vi.fn(),
  rmMock: vi.fn(),
  spawnMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.stubGlobal('fetch', fetchMock);

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('node:crypto', () => ({
  randomUUID: randomUUIDMock,
}));

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();

  return {
    ...actual,
    default: {
      ...actual,
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

vi.mock('../deploy/loadZerospinConfigFn.js', () => ({
  loadZerospinConfigFn: loadZerospinConfigMock,
}));

describe('devFn', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    loadEnvMock.mockReset();
    loadConfigMock.mockReset();
    loadConfigMock.mockResolvedValue({
      config: {
        name: 'zerospin-test',
        main: './src/Worker.ts',
        compatibility_date: '2026-01-20',
        compatibility_flags: ['nodejs_compat'],
        alias: {
          system: './src/system.ts',
        },
        migrations: [
          {
            tag: 'v1',
            new_sqlite_classes: ['SystemRepo'],
          },
        ],
        vars: {
          DEV: 'stale',
          ZEROSPIN_CLEAN_REQUEST_ID: 'cln_stale',
          ZEROSPIN_DEPLOY_ID: 'dpl_stale',
          ZEROSPIN_GENERATION_ID: 'gen_stale',
          ZEROSPIN_INSTANCE_ID: 'stale',
          ZEROSPIN_SYSTEM_RELEASE: 'stale',
          ZEROSPIN_SYSTEM_ID: 'sys_test',
        },
        preserved_null: null,
      },
      configFile: path.join(process.cwd(), 'wrangler.jsonc'),
    });
    loadZerospinConfigMock.mockReset();
    loadZerospinConfigMock.mockReturnValue(
      Effect.succeed({
        entry: 'src/system.ts',
        environmentId: 'dev',
        env: null,
        seeds: 'src/seeds.ts',
      }),
    );
    resolveMock.mockReset();
    resolveMock.mockImplementation((specifier: string) => {
      if (specifier === 'wrangler/bin/wrangler.js') {
        return '/project/node_modules/wrangler/bin/wrangler.js';
      }
      if (specifier === '@zerospin/dispatch-worker/Worker') {
        return '/project/node_modules/@zerospin/dispatch-worker/dist/Worker.js';
      }
      return specifier;
    });
    rmMock.mockReset();
    rmMock.mockResolvedValue(undefined);
    randomUUIDMock.mockReset();
    randomUUIDMock.mockReturnValue('test-clean-request');
    spawnMock.mockReset();
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined);
    delete process.env['ZEROSPIN_PORT'];
  });

  it('loads .env.local and .env before loading zerospin.config', async () => {
    loadEnvMock.mockImplementation(({ path: envPath }) => {
      if (envPath.endsWith('.env.local')) {
        process.env['ZEROSPIN_DEV_CONFIG_TEST'] = 'local';
      }
      return {};
    });
    loadZerospinConfigMock.mockImplementation(() => {
      expect(process.env['ZEROSPIN_DEV_CONFIG_TEST']).toBe('local');
      return Effect.succeed({
        entry: 'src/system.ts',
        environmentId: 'dev',
        env: null,
        seeds: 'src/seeds.ts',
      });
    });
    writeFileMock.mockRejectedValue(new Error('stop after config loading'));

    try {
      await Effect.runPromise(
        devFn({ clean: false, port: 3005 }).pipe(
          Effect.provide(AsyncLive),
          Effect.flip,
        ),
      );

      expect(loadEnvMock.mock.calls).toEqual([
        [{ path: path.join(process.cwd(), '.env.local') }],
        [{ path: path.join(process.cwd(), '.env') }],
      ]);
      expect(loadZerospinConfigMock).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env['ZEROSPIN_DEV_CONFIG_TEST'];
    }
  });

  it('uses ZEROSPIN_PORT from env when --port is omitted', async () => {
    loadEnvMock.mockImplementation(({ path: envPath }) => {
      if (envPath.endsWith('.env.local')) {
        process.env['ZEROSPIN_PORT'] = '4001';
      }
      return {};
    });
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
    });
    spawnMock.mockReturnValue(child);
    const generatedConfigName = `wrangler.zerospin-dev.${process.pid}.local.json`;

    const resultPromise = Effect.runPromise(
      devFn({ clean: false, port: undefined }).pipe(Effect.provide(AsyncLive)),
    );

    await vi.waitFor(() =>
      expect(spawnMock).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--port', '4001']),
        expect.objectContaining({ cwd: process.cwd() }),
      ),
    );
    expect(spawnMock.mock.calls[0]?.[1]).toEqual([
      '/project/node_modules/wrangler/bin/wrangler.js',
      'dev',
      '-c',
      `./${generatedConfigName}`,
      '--ip',
      '0.0.0.0',
      '--port',
      '4001',
      '--persist-to',
      path.join(
        process.cwd(),
        '.wrangler',
        'zerospin',
        'dev',
        'sys_test%3Alocal',
      ),
      '--var',
      'DEV:true',
      '--var',
      'ZEROSPIN_INSTANCE_ID:local',
    ]);

    child.emit('close', 0, null);
    await expect(resultPromise).resolves.toEqual({ port: 4001 });
  });

  it('prefers CLI --port over ZEROSPIN_PORT', async () => {
    process.env['ZEROSPIN_PORT'] = '4001';
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
    });
    spawnMock.mockReturnValue(child);

    const resultPromise = Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(Effect.provide(AsyncLive)),
    );

    await vi.waitFor(() =>
      expect(spawnMock).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--port', '3005']),
        expect.objectContaining({ cwd: process.cwd() }),
      ),
    );

    child.emit('close', 0, null);
    await expect(resultPromise).resolves.toEqual({ port: 3005 });
  });

  it('rejects an invalid ZEROSPIN_PORT', async () => {
    process.env['ZEROSPIN_PORT'] = 'nope';

    await expect(
      Effect.runPromise(
        devFn({ clean: false, port: undefined }).pipe(
          Effect.provide(AsyncLive),
          Effect.flip,
        ),
      ),
    ).resolves.toMatchObject({
      code: 'zerospin-dev-invalid-port',
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('derives a clean request over the stable instance root and forwards termination signals', async () => {
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
    });
    spawnMock.mockReturnValue(child);
    const sigtermListenerIndex = process.listenerCount('SIGTERM');
    const generatedConfigName = `wrangler.zerospin-dev.${process.pid}.local.json`;
    const persistenceRoot = path.join(
      process.cwd(),
      '.wrangler',
      'zerospin',
      'dev',
      'sys_test%3Alocal',
    );

    const resultPromise = Effect.runPromise(
      devFn({ clean: true, port: 3005 }).pipe(Effect.provide(AsyncLive)),
    );

    await vi.waitFor(() =>
      expect(spawnMock).toHaveBeenCalledWith(
        process.execPath,
        [
          '/project/node_modules/wrangler/bin/wrangler.js',
          'dev',
          '-c',
          `./${generatedConfigName}`,
          '--ip',
          '0.0.0.0',
          '--port',
          '3005',
          '--persist-to',
          persistenceRoot,
          '--var',
          'DEV:true',
          '--var',
          'ZEROSPIN_INSTANCE_ID:local',
          '--var',
          'ZEROSPIN_CLEAN_REQUEST_ID:cln_test-clean-request',
        ],
        {
          cwd: process.cwd(),
          env: process.env,
          stdio: ['inherit', 'pipe', 'inherit'],
        },
      ),
    );

    expect(resolveMock).toHaveBeenCalledWith('wrangler/bin/wrangler.js', {
      paths: [process.cwd()],
    });
    expect(resolveMock).toHaveBeenCalledWith(
      '@zerospin/dispatch-worker/Worker',
    );
    expect(resolveMock).toHaveBeenCalledWith(
      path.join(process.cwd(), 'src/seeds.ts'),
    );
    expect(rmMock).not.toHaveBeenCalled();

    const generatedConfig = JSON.parse(writeFileMock.mock.calls[0]?.[1]);
    expect(generatedConfig).toEqual({
      name: 'zerospin-test',
      main: '/project/node_modules/@zerospin/dispatch-worker/dist/Worker.js',
      compatibility_date: '2026-01-20',
      compatibility_flags: ['nodejs_compat'],
      alias: {
        system: './src/system.ts',
        seeds: path.join(process.cwd(), 'src/seeds.ts'),
      },
      migrations: [
        {
          tag: 'v1',
          new_sqlite_classes: ['SystemRepo'],
        },
        {
          tag: 'zerospin-dev-v1',
          new_sqlite_classes: ['DevZerospinApis'],
        },
      ],
      vars: {
        ZEROSPIN_SYSTEM_ID: 'sys_test',
      },
      preserved_null: null,
      version_metadata: {
        binding: 'ZEROSPIN_VERSION_METADATA',
      },
    });

    process.listeners('SIGTERM')[sigtermListenerIndex]?.();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    child.emit('close', 0, null);
    await expect(resultPromise).resolves.toEqual({ port: 3005 });
    expect(rmMock).toHaveBeenCalledWith(
      path.join(process.cwd(), generatedConfigName),
      { force: true },
    );
  });

  it('uses the empty seed module and preserves state on ordinary dev', async () => {
    loadZerospinConfigMock.mockReturnValue(
      Effect.succeed({
        entry: 'src/system.ts',
        environmentId: 'dev',
        env: null,
        seeds: null,
      }),
    );
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
    });
    spawnMock.mockReturnValue(child);
    const generatedConfigName = `wrangler.zerospin-dev.${process.pid}.local.json`;
    const persistenceRoot = path.join(
      process.cwd(),
      '.wrangler',
      'zerospin',
      'dev',
      'sys_test%3Alocal',
    );

    const resultPromise = Effect.runPromise(
      devFn({ clean: false, port: undefined }).pipe(Effect.provide(AsyncLive)),
    );

    await vi.waitFor(() =>
      expect(spawnMock).toHaveBeenCalledWith(
        process.execPath,
        [
          '/project/node_modules/wrangler/bin/wrangler.js',
          'dev',
          '-c',
          `./${generatedConfigName}`,
          '--ip',
          '0.0.0.0',
          '--persist-to',
          persistenceRoot,
          '--var',
          'DEV:true',
          '--var',
          'ZEROSPIN_INSTANCE_ID:local',
        ],
        {
          cwd: process.cwd(),
          env: process.env,
          stdio: ['inherit', 'pipe', 'inherit'],
        },
      ),
    );
    expect(rmMock).not.toHaveBeenCalled();
    expect(resolveMock).toHaveBeenCalledWith(
      '/project/node_modules/@zerospin/dispatch-worker/dist/emptySeeds.js',
    );

    child.emit('close', 0, null);
    await expect(resultPromise).resolves.toEqual({ port: undefined });
    expect(rmMock).toHaveBeenCalledTimes(1);
  });

  it('enables ctx.exports for a pre-default compatibility date', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        compatibility_date: '2025-11-16',
        compatibility_flags: [
          'nodejs_compat',
          'enable_ctx_exports',
          'enable_ctx_exports',
        ],
        vars: {
          ZEROSPIN_SYSTEM_ID: 'sys_test',
        },
      },
    });
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
    });
    spawnMock.mockReturnValue(child);

    const resultPromise = Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(Effect.provide(AsyncLive)),
    );
    await vi.waitFor(() => expect(writeFileMock).toHaveBeenCalledTimes(1));

    const generatedConfig = JSON.parse(writeFileMock.mock.calls[0]?.[1]);
    expect(generatedConfig.compatibility_flags).toEqual([
      'nodejs_compat',
      'enable_ctx_exports',
    ]);

    child.emit('close', 0, null);
    await expect(resultPromise).resolves.toEqual({ port: 3005 });
  });

  it('removes supplied ctx.exports flags after the feature becomes default-on', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        compatibility_date: '2025-11-17',
        compatibility_flags: [
          'nodejs_compat',
          'enable_ctx_exports',
          'enable_ctx_exports',
        ],
        vars: {
          ZEROSPIN_SYSTEM_ID: 'sys_test',
        },
      },
    });
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
    });
    spawnMock.mockReturnValue(child);

    const resultPromise = Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(Effect.provide(AsyncLive)),
    );
    await vi.waitFor(() => expect(writeFileMock).toHaveBeenCalledTimes(1));

    const generatedConfig = JSON.parse(writeFileMock.mock.calls[0]?.[1]);
    expect(generatedConfig.compatibility_flags).toEqual(['nodejs_compat']);

    child.emit('close', 0, null);
    await expect(resultPromise).resolves.toEqual({ port: 3005 });
  });

  it('rejects a config that disables ctx.exports', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        compatibility_date: '2026-01-20',
        compatibility_flags: ['disable_ctx_exports'],
        vars: {
          ZEROSPIN_SYSTEM_ID: 'sys_test',
        },
      },
    });

    const error = await Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({
      code: 'zerospin-dev-wrangler-config-invalid',
    });
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('fails when Wrangler cannot be resolved from the current project', async () => {
    resolveMock.mockImplementation(() => {
      throw new Error('missing wrangler');
    });

    const error = await Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({
      code: 'zerospin-dev-wrangler-not-found',
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('fails when the CLI-owned dispatch Worker cannot be resolved', async () => {
    resolveMock.mockImplementation((specifier: string) => {
      if (specifier === 'wrangler/bin/wrangler.js') {
        return '/project/node_modules/wrangler/bin/wrangler.js';
      }
      if (specifier === '@zerospin/dispatch-worker/Worker') {
        throw new Error('missing dispatch Worker');
      }
      return specifier;
    });

    const error = await Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({
      code: 'zerospin-dev-dispatch-worker-not-found',
    });
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('fails when the configured seed module cannot be resolved', async () => {
    resolveMock.mockImplementation((specifier: string) => {
      if (specifier === 'wrangler/bin/wrangler.js') {
        return '/project/node_modules/wrangler/bin/wrangler.js';
      }
      if (specifier === '@zerospin/dispatch-worker/Worker') {
        return '/project/node_modules/@zerospin/dispatch-worker/dist/Worker.js';
      }
      if (specifier === path.join(process.cwd(), 'src/seeds.ts')) {
        throw new Error('missing configured seeds');
      }
      return specifier;
    });

    const error = await Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({
      code: 'zerospin-dev-seeds-not-found',
      message: expect.stringContaining('src/seeds.ts'),
    });
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('fails when the built-in empty seed module cannot be resolved', async () => {
    loadZerospinConfigMock.mockReturnValue(
      Effect.succeed({
        entry: 'src/system.ts',
        environmentId: 'dev',
        env: null,
        seeds: null,
      }),
    );
    resolveMock.mockImplementation((specifier: string) => {
      if (specifier === 'wrangler/bin/wrangler.js') {
        return '/project/node_modules/wrangler/bin/wrangler.js';
      }
      if (specifier === '@zerospin/dispatch-worker/Worker') {
        return '/project/node_modules/@zerospin/dispatch-worker/dist/Worker.js';
      }
      if (
        specifier ===
        '/project/node_modules/@zerospin/dispatch-worker/dist/emptySeeds.js'
      ) {
        throw new Error('missing built-in seeds');
      }
      return specifier;
    });

    const error = await Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({
      code: 'zerospin-dev-seeds-not-found',
    });
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('fails when spawning Wrangler throws', async () => {
    spawnMock.mockImplementation(() => {
      throw new Error('spawn failed');
    });

    const error = await Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({
      code: 'zerospin-dev-wrangler-start-failed',
    });
    expect(rmMock).toHaveBeenCalledWith(
      path.join(
        process.cwd(),
        `wrangler.zerospin-dev.${process.pid}.local.json`,
      ),
      { force: true },
    );
  });

  it('fails when Wrangler emits a startup error', async () => {
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
    });
    spawnMock.mockReturnValue(child);

    const errorPromise = Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    child.emit('error', new Error('startup failed'));

    await expect(errorPromise).resolves.toMatchObject({
      code: 'zerospin-dev-wrangler-start-failed',
    });
    expect(rmMock).toHaveBeenCalledWith(
      path.join(
        process.cwd(),
        `wrangler.zerospin-dev.${process.pid}.local.json`,
      ),
      { force: true },
    );
  });

  it('checks the durable deployment barrier whenever Wrangler reports ready', async () => {
    const stdout = new PassThrough();
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
      stdout,
    });
    spawnMock.mockReturnValue(child);

    const resultPromise = Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(Effect.provide(AsyncLive)),
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));

    stdout.write('Ready on http://127.0.0.1:3005\n');
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:3005/__zerospin/ready',
      ),
    );

    child.emit('close', 0, null);
    await expect(resultPromise).resolves.toEqual({ port: 3005 });
  });

  it('stops Wrangler and fails when the deployed code version is not ready', async () => {
    fetchMock.mockResolvedValue(
      new Response('breaking model change: add an adapter or rerun --clean', {
        status: 500,
      }),
    );
    const stdout = new PassThrough();
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
      stdout,
    });
    spawnMock.mockReturnValue(child);

    const errorPromise = Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));

    stdout.write('Ready on http://127.0.0.1:3005\n');

    await expect(errorPromise).resolves.toMatchObject({
      code: 'zerospin-dev-worker-not-ready',
      cause: expect.stringContaining('breaking model change'),
    });
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('fails when Wrangler exits with a nonzero code', async () => {
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
    });
    spawnMock.mockReturnValue(child);

    const errorPromise = Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    child.emit('close', 7, null);

    await expect(errorPromise).resolves.toMatchObject({
      code: 'zerospin-dev-wrangler-exited',
    });
    expect(rmMock).toHaveBeenCalledWith(
      path.join(
        process.cwd(),
        `wrangler.zerospin-dev.${process.pid}.local.json`,
      ),
      { force: true },
    );
  });

  it('fails when Wrangler exits from a signal', async () => {
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
    });
    spawnMock.mockReturnValue(child);

    const errorPromise = Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    child.emit('close', null, 'SIGTERM');

    await expect(errorPromise).resolves.toMatchObject({
      code: 'zerospin-dev-wrangler-signaled',
    });
    expect(rmMock).toHaveBeenCalledWith(
      path.join(
        process.cwd(),
        `wrangler.zerospin-dev.${process.pid}.local.json`,
      ),
      { force: true },
    );
  });

  it('fails before startup when the Wrangler config cannot be loaded', async () => {
    loadConfigMock.mockRejectedValue(new Error('bad jsonc'));

    const error = await Effect.runPromise(
      devFn({ clean: true, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({
      code: 'zerospin-dev-wrangler-config-load-failed',
    });
    expect(rmMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('propagates a zerospin config load failure before loading Wrangler config', async () => {
    const configError = new Error('bad zerospin config');
    loadZerospinConfigMock.mockReturnValue(Effect.fail(configError));

    const error = await Effect.runPromise(
      devFn({ clean: true, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({
      message: 'bad zerospin config',
    });
    expect(loadConfigMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(rmMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('fails before startup when the system id is not a prefixed id', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        vars: {
          ZEROSPIN_SYSTEM_ID: 2,
        },
      },
    });

    const error = await Effect.runPromise(
      devFn({ clean: true, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({
      code: 'zerospin-dev-system-id-missing',
    });
    expect(rmMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects a user migration with the reserved dev tag', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        migrations: [{ tag: 'zerospin-dev-v1' }],
        vars: {
          ZEROSPIN_SYSTEM_ID: 'sys_test',
        },
      },
    });

    const error = await Effect.runPromise(
      devFn({ clean: true, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({
      code: 'zerospin-dev-migration-conflict',
    });
    expect(rmMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects a non-object Wrangler alias', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        alias: './src/aliases.ts',
        vars: {
          ZEROSPIN_SYSTEM_ID: 'sys_test',
        },
      },
    });

    const error = await Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({
      code: 'zerospin-dev-wrangler-config-invalid',
    });
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects Wrangler compatibility flags containing a non-string', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        compatibility_flags: ['nodejs_compat', 1],
        vars: {
          ZEROSPIN_SYSTEM_ID: 'sys_test',
        },
      },
    });

    const error = await Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({
      code: 'zerospin-dev-wrangler-config-invalid',
    });
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects non-array Wrangler migrations', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        migrations: {
          tag: 'v1',
        },
        vars: {
          ZEROSPIN_SYSTEM_ID: 'sys_test',
        },
      },
    });

    const error = await Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({
      code: 'zerospin-dev-wrangler-config-invalid',
    });
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('loads comments, trailing commas, and explicit nulls through real c12 JSONC parsing', async () => {
    const actualC12 = await vi.importActual<typeof import('c12')>('c12');
    const actualFs = await vi.importActual<
      typeof import('node:fs/promises')
    >('node:fs/promises');
    const tempCwd = await actualFs.mkdtemp(
      path.join(os.tmpdir(), 'zerospin-devFn-'),
    );
    const cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tempCwd);
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
    });

    try {
      await actualFs.writeFile(
        path.join(tempCwd, 'wrangler.jsonc'),
        `{
          // c12 must accept Wrangler's JSONC syntax.
          "name": "jsonc-test",
          "compatibility_date": "2026-01-20",
          "compatibility_flags": ["nodejs_compat",],
          "vars": {
            "ZEROSPIN_SYSTEM_ID": "sys_jsonc",
            "OPTIONAL_VALUE": null,
          },
          "nested": {
            "preserved_null": null,
          },
        }\n`,
        'utf8',
      );
      loadConfigMock.mockImplementationOnce(actualC12.loadConfig);
      spawnMock.mockReturnValue(child);

      const resultPromise = Effect.runPromise(
        devFn({ clean: false, port: 3005 }).pipe(Effect.provide(AsyncLive)),
      );
      await vi.waitFor(() => expect(writeFileMock).toHaveBeenCalledTimes(1));

      const generatedConfig = JSON.parse(writeFileMock.mock.calls[0]?.[1]);
      expect(generatedConfig).toMatchObject({
        name: 'jsonc-test',
        compatibility_flags: ['nodejs_compat'],
        vars: {
          ZEROSPIN_SYSTEM_ID: 'sys_jsonc',
          OPTIONAL_VALUE: null,
        },
        nested: {
          preserved_null: null,
        },
      });

      child.emit('close', 0, null);
      await expect(resultPromise).resolves.toEqual({ port: 3005 });
    } finally {
      cwdMock.mockRestore();
      await actualFs.rm(tempCwd, { recursive: true, force: true });
    }
  });

  it('removes a partially written generated config when writing fails', async () => {
    writeFileMock.mockRejectedValue(new Error('disk full'));

    const error = await Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({
      code: 'zerospin-dev-generated-config-write-failed',
    });
    expect(rmMock).toHaveBeenCalledWith(
      path.join(
        process.cwd(),
        `wrangler.zerospin-dev.${process.pid}.local.json`,
      ),
      { force: true },
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('reports generated config cleanup failures', async () => {
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      killed: false,
    });
    spawnMock.mockReturnValue(child);
    rmMock.mockRejectedValue(new Error('cannot unlink'));

    const errorPromise = Effect.runPromise(
      devFn({ clean: false, port: 3005 }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    child.emit('close', 0, null);

    await expect(errorPromise).resolves.toMatchObject({
      code: 'zerospin-dev-generated-config-remove-failed',
    });
  });

  it('kills Wrangler and removes the generated config when interrupted', async () => {
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(() => {
        void Promise.resolve().then(() =>
          child.emit('close', null, 'SIGTERM'),
        );
        return true;
      }),
      killed: false,
    });
    spawnMock.mockReturnValue(child);

    const fiber = Effect.runFork(
      devFn({ clean: false, port: 3005 }).pipe(Effect.provide(AsyncLive)),
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    await Effect.runPromise(Fiber.interrupt(fiber));

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(rmMock).toHaveBeenCalledWith(
      path.join(
        process.cwd(),
        `wrangler.zerospin-dev.${process.pid}.local.json`,
      ),
      { force: true },
    );
  });
});
