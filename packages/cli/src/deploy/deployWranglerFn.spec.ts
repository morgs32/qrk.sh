import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deployWranglerFn } from './deployWranglerFn.js';

const {
  fetchMock,
  loadConfigMock,
  loadEnvMock,
  loadZerospinConfigMock,
  mkdtempMock,
  randomBytesMock,
  resolveMock,
  rmMock,
  spawnMock,
  writeFileMock,
} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  loadConfigMock: vi.fn(),
  loadEnvMock: vi.fn(),
  loadZerospinConfigMock: vi.fn(),
  mkdtempMock: vi.fn(),
  randomBytesMock: vi.fn(),
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
  randomBytes: randomBytesMock,
  randomUUID: vi.fn(),
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

describe('deployWranglerFn', () => {
  const originalPublishableKey = process.env['ZEROSPIN_PUBLISHABLE_KEY'];
  const originalSecretKey = process.env['ZEROSPIN_SECRET_KEY'];
  const originalClerkJwtKey = process.env['CLERK_JWT_KEY'];
  const originalApiUrl = process.env['ZEROSPIN_API_URL'];

  beforeEach(() => {
    delete process.env['ZEROSPIN_PUBLISHABLE_KEY'];
    delete process.env['ZEROSPIN_SECRET_KEY'];
    delete process.env['CLERK_JWT_KEY'];
    process.env['ZEROSPIN_API_URL'] = 'https://api.zerospin.dev';
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    loadConfigMock.mockReset();
    loadEnvMock.mockReset();
    loadZerospinConfigMock.mockReset();
    mkdtempMock.mockReset();
    mkdtempMock.mockResolvedValue('/tmp/zerospin-wrangler-test');
    randomBytesMock.mockReset();
    randomBytesMock
      .mockReturnValueOnce(Buffer.from('project-publishable-key'))
      .mockReturnValueOnce(Buffer.from('project-secret-key'));
    resolveMock.mockReset();
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
    if (originalClerkJwtKey === undefined) {
      delete process.env['CLERK_JWT_KEY'];
    } else {
      process.env['CLERK_JWT_KEY'] = originalClerkJwtKey;
    }
    if (originalApiUrl === undefined) {
      delete process.env['ZEROSPIN_API_URL'];
    } else {
      process.env['ZEROSPIN_API_URL'] = originalApiUrl;
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires the operator-provided Clerk JWT key before loading Wrangler', async () => {
    process.env['ZEROSPIN_PUBLISHABLE_KEY'] = 'pk_live_existing';
    process.env['ZEROSPIN_SECRET_KEY'] = 'sk_live_existing';

    const error = await Effect.runPromise(
      deployWranglerFn({ clean: false }).pipe(
        Effect.provide(AsyncLive),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({
      code: 'zerospin-wrangler-clerk-jwt-key-missing',
    });
    expect(loadZerospinConfigMock).not.toHaveBeenCalled();
    expect(loadConfigMock).not.toHaveBeenCalled();
    expect(resolveMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('deploys an existing project key pair through local Wrangler and waits for readiness', async () => {
    process.env['ZEROSPIN_PUBLISHABLE_KEY'] = 'pk_live_existing';
    process.env['ZEROSPIN_SECRET_KEY'] = 'sk_live_existing';
    process.env['CLERK_JWT_KEY'] = 'clerk-jwt-public-key';

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
        name: 'self-hosted-test',
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
        vars: {
          AUTHORED_VAR: 'preserved',
          NEXT_PUBLIC_ZEROSPIN_API_URL: 'https://api.zerospin.dev',
          ZEROSPIN_API_URL: 'https://api.zerospin.dev',
          ZEROSPIN_SYSTEM_ID: 'sys_self_hosted_test',
          ZEROSPIN_DEPLOY_ID: 'dpl_hosted_poison',
          ZEROSPIN_GENERATION_ID: 'gen_hosted_poison',
          ZEROSPIN_INSTANCE_ID: 'hosted-poison',
          ZEROSPIN_SELF_HOSTED: 'hosted-poison',
        },
      },
    });
    resolveMock.mockImplementation((specifier: string) => {
      if (specifier === 'wrangler/package.json') {
        return '/project/node_modules/wrangler/package.json';
      }
      if (specifier === '@zerospin/dispatch-worker/Worker') {
        return '/project/node_modules/@zerospin/dispatch-worker/dist/Worker.js';
      }
      if (specifier.endsWith('/emptySeeds.js')) {
        return '/project/node_modules/@zerospin/dispatch-worker/dist/emptySeeds.js';
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
      deployWranglerFn({ clean: false }).pipe(Effect.provide(AsyncLive)),
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));

    stdout.write(
      'Uploaded self-hosted-test\nhttps://self-hosted-test.account.workers.dev\n',
    );
    child.emit('close', 0, null);

    await expect(resultPromise).resolves.toEqual({
      status: 'deployed',
      workerUrl: 'https://self-hosted-test.account.workers.dev',
      zerospinPublishableKey: 'pk_live_existing',
    });

    // 3. The generated production configuration preserves authored fields,
    //    discards hosted generation pins, and installs the first production DO
    //    migration directly on SelfHostedZerospinApis.
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
    expect(wranglerEnvironment).not.toHaveProperty(
      'NEXT_PUBLIC_ZEROSPIN_API_URL',
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
    expect(generatedConfig).toMatchObject({
      name: 'self-hosted-test',
      main: '/project/node_modules/@zerospin/dispatch-worker/dist/Worker.js',
      compatibility_date: '2026-07-22',
      compatibility_flags: ['nodejs_compat'],
      alias: {
        authored: './src/authored.ts',
        system: path.resolve(process.cwd(), 'src/system.ts'),
        seeds:
          '/project/node_modules/@zerospin/dispatch-worker/dist/emptySeeds.js',
      },
      migrations: [
        {
          tag: 'zerospin-self-hosted-v1',
          new_sqlite_classes: ['SelfHostedZerospinApis'],
        },
        {
          tag: 'authored-v1',
          new_sqlite_classes: ['AuthoredRepo'],
        },
      ],
      vars: {
        AUTHORED_VAR: 'preserved',
        ZEROSPIN_SYSTEM_ID: 'sys_self_hosted_test',
        ZEROSPIN_INSTANCE_ID: 'production',
        ZEROSPIN_SELF_HOSTED: 'true',
      },
      version_metadata: {
        binding: 'ZEROSPIN_VERSION_METADATA',
      },
    });
    expect(generatedConfig.vars).not.toHaveProperty('ZEROSPIN_DEPLOY_ID');
    expect(generatedConfig.vars).not.toHaveProperty('ZEROSPIN_GENERATION_ID');
    expect(generatedConfig.vars).not.toHaveProperty(
      'NEXT_PUBLIC_ZEROSPIN_API_URL',
    );
    expect(generatedConfig.vars).not.toHaveProperty('ZEROSPIN_API_URL');
    expect(secrets).toEqual({
      ZEROSPIN_PUBLISHABLE_KEY: 'pk_live_existing',
      ZEROSPIN_SECRET_KEY: 'sk_live_existing',
      CLERK_JWT_KEY: 'clerk-jwt-public-key',
    });
    expect(randomBytesMock).not.toHaveBeenCalled();

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

    expect(fetchMock).toHaveBeenCalledWith(
      'https://self-hosted-test.account.workers.dev/__zerospin/ready',
    );
    expect(rmMock).toHaveBeenCalledWith('/tmp/zerospin-wrangler-test', {
      recursive: true,
      force: true,
    });
  });
});
