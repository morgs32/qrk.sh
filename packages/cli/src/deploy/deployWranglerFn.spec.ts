import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { access, readFile, writeFile } from 'node:fs/promises';
import { TextEncoder } from 'node:util';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { ZerospinError } from '@zerospin/error';
import { Effect, Stream } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deployWranglerFn } from './deployWranglerFn.js';

const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  start: vi.fn(),
  teardown: vi.fn(),
  check: vi.fn(),
  healthcheck: vi.fn(),
  initialize: vi.fn(),
  dispose: vi.fn(),
  session: vi.fn(),
}));
vi.mock('node:module', () => ({
  createRequire: () =>
    Object.assign(
      () => ({
        unstable_DevEnv: class extends EventEmitter {
          startWorker = mocks.start;
          teardown = mocks.teardown;
        },
      }),
      { resolve: (name: string) => `/fixture/${name}` },
    ),
}));
vi.mock('dotenv', () => ({ config: vi.fn() }));
vi.mock('./loadZerospinConfigFn.js', () => ({
  loadZerospinConfigFn: () =>
    Effect.succeed({
      system: { name: 'production-fixture' },
      systemId: 'sys_production_fixture',
    }),
}));
vi.mock('./makeSystemEntry.js', () => ({
  makeSystemEntry: () => Effect.succeed('/fixture/system.ts'),
}));
vi.mock('effect/unstable/process', () => ({
  ChildProcess: {
    make: (...args: unknown[]) => Effect.promise(() => mocks.command(...args)),
  },
}));
vi.mock('@zerospin/core/utils/newSyncRpcSession', () => ({
  newSyncRpcSession: (url: string) => {
    mocks.session(url);
    return {
      [Symbol.dispose]: mocks.dispose,
      getSystemApi: (auth: unknown) => {
        expect(auth).toEqual({ zerospinSecretKey: 'sk_live_fixture' });
        return {
          checkSystemSpec: mocks.check,
          healthcheck: mocks.healthcheck,
          initialize: mocks.initialize,
        };
      },
    };
  },
}));

const incumbentVersion = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const candidateVersion = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const history: {
  id: string;
  created_on: string;
  annotations?: Record<string, string>;
  versions: { version_id: string; percentage: number }[];
}[] = [];
let order: string[];
let generatedPaths: string[];
let forwarderSource: string;
let failCommand: string | undefined;
let missingWorker: boolean;
let promotionFails: boolean;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ZEROSPIN_PUBLISHABLE_KEY', 'pk_live_fixture');
  vi.stubEnv('ZEROSPIN_SECRET_KEY', 'sk_live_fixture');
  order = [];
  generatedPaths = [];
  forwarderSource = '';
  failCommand = undefined;
  missingWorker = false;
  promotionFails = false;
  history.splice(0, history.length, {
    id: 'incumbent-deployment',
    created_on: '2026-09-10T00:00:00Z',
    versions: [{ version_id: incumbentVersion, percentage: 100 }],
  });
  mocks.command.mockImplementation(
    async (
      _node: string,
      args: string[],
      options: { env: Record<string, string> },
    ) => {
      const verb = args[1] === 'deploy' ? 'deploy' : args.slice(1, 3).join(' ');
      order.push(verb);
      const configPath = args[args.indexOf('--config') + 1]!;
      generatedPaths.push(configPath);
      const config = JSON.parse(await readFile(configPath, 'utf8'));
      expect(configPath).toContain('/.wrangler/zerospin/deploy-');
      expect(config).toMatchObject({
        name: 'zerospin-production-fixture',
        main: '/fixture/@zerospin/production-worker/ProductionWorker',
        compatibility_date: '2026-01-20',
        compatibility_flags: ['nodejs_compat'],
        alias: { system: '/fixture/system.ts' },
        vars: {
          ZEROSPIN_SYSTEM_ID: 'sys_production_fixture',
          ZEROSPIN_ENVIRONMENT: 'production',
        },
        version_metadata: { binding: 'ZEROSPIN_VERSION_METADATA' },
        exports: { SystemRepo: { type: 'durable-object', storage: 'sqlite' } },
      });
      expect(config.durable_objects.bindings).toHaveLength(13);
      expect(config.vars).not.toHaveProperty('ZEROSPIN_SECRET_KEY');

      expect(config.version_metadata).toEqual({
        binding: 'ZEROSPIN_VERSION_METADATA',
      });
      expect(config.preview_urls).toBeUndefined();
      expect(options.env['ZEROSPIN_SECRET_KEY']).toBeUndefined();
      const stdout: string[] = [];
      const stderr: string[] = [];
      const records: unknown[] = [];
      let exitCode = 0;
      if (verb === failCommand) {
        exitCode = 1;
        stderr.push('Authentication error [code: 10000]');
      } else if (verb === 'deployments list') {
        if (missingWorker) {
          exitCode = 1;
          stderr.push('Worker not found [code: 10007]');
        } else {
          stdout.push(JSON.stringify(history));
        }
      } else if (verb === 'versions upload') {
        records.push({ type: 'version-upload', version_id: candidateVersion });
      } else if (verb === 'deploy') {
        missingWorker = false;
        history.push({
          id: 'initial-deployment',
          created_on: '2026-09-10T00:00:01Z',
          versions: [{ version_id: candidateVersion, percentage: 100 }],
        });
        records.push({ type: 'deploy', version_id: candidateVersion });
      } else if (verb === 'versions deploy') {
        const versions = args
          .filter(arg => arg.includes('@'))
          .map(arg => ({
            version_id: arg.split('@')[0]!,
            percentage: Number(arg.split('@')[1]!.replace('%', '')),
          }));
        const promotion =
          versions.length === 1 &&
          versions[0]?.version_id === candidateVersion &&
          history.length > 1;
        if (promotion && promotionFails) {
          exitCode = 1;
          stderr.push('Promotion failed');
        } else {
          missingWorker = false;
          const deployment = {
            id: `deployment-${history.length}`,
            created_on: `2026-09-10T00:00:${String(history.length + 1).padStart(2, '0')}Z`,
            annotations: args.includes('--message')
              ? { 'workers/message': args[args.indexOf('--message') + 1]! }
              : {},
            versions,
          };
          history.push(deployment);
          records.push({
            type: 'version-deploy',
            deployment_id: deployment.id,
          });
        }
      } else {
        throw new Error(`Unexpected command ${verb}`);
      }
      if (records.length > 0) {
        await writeFile(
          options.env['WRANGLER_OUTPUT_FILE_PATH']!,
          records.map(record => JSON.stringify(record)).join('\n'),
        );
      }
      return {
        exitCode: Effect.succeed(exitCode),
        stdout: Stream.fromIterable(
          stdout.map(text => new TextEncoder().encode(text)),
        ),
        stderr: Stream.fromIterable(
          stderr.map(text => new TextEncoder().encode(text)),
        ),
      };
    },
  );
  mocks.start.mockImplementation(async ({ config }: { config: string }) => {
    generatedPaths.push(config);
    const configuration = JSON.parse(await readFile(config, 'utf8'));
    expect(configuration.name).not.toBe('zerospin-production-fixture');
    expect(configuration.services).toEqual([
      {
        binding: 'PRODUCTION',
        service: 'zerospin-production-fixture',
        remote: true,
      },
    ]);
    expect(configuration.account_id).toBeUndefined();
    forwarderSource = await readFile(configuration.main, 'utf8');
    order.push('forwarder');
    return { url: Promise.resolve(new URL('http://127.0.0.1:9191')) };
  });
  mocks.check.mockImplementation(async (envelope: unknown) => {
    expect(envelope).toEqual({ args: [], traceContext: null });
    order.push('check');
    return {
      result: {
        _tag: 'Success',
        success: {
          workerVersionId:
            history.at(-1)?.versions.length === 1
              ? candidateVersion
              : incumbentVersion,
        },
      },
    };
  });
  mocks.healthcheck.mockImplementation(async () => {
    order.push('healthcheck');
    return { result: { _tag: 'Success', success: 'healthy' } };
  });
  mocks.initialize.mockImplementation(async () => {
    order.push('initialize');
    return { result: { _tag: 'Success', success: undefined } };
  });
  mocks.teardown.mockResolvedValue(undefined);
});

afterEach(async () => {
  process.exitCode = 0;
  vi.unstubAllEnvs();
  vi.useRealTimers();
  for (const config of generatedPaths) {
    await expect(access(config)).rejects.toThrow();
  }
});

describe('production preflight deployment', () => {
  it('stages A100/B0, accepts B with no domain arguments, promotes that ID, then initializes through the local binding', async () => {
    const result = await Effect.runPromise(
      deployWranglerFn().pipe(Effect.provide(AsyncLive)),
    );
    expect(result).toEqual({
      status: 'deployed',
      workerName: 'zerospin-production-fixture',
      versionId: candidateVersion,
      zerospinPublishableKey: 'pk_live_fixture',
    });
    expect(history[1]?.versions).toEqual([
      { version_id: incumbentVersion, percentage: 100 },
      { version_id: candidateVersion, percentage: 0 },
    ]);
    expect(history.at(-1)?.versions).toEqual([
      { version_id: candidateVersion, percentage: 100 },
    ]);
    expect(order).toEqual([
      'deployments list',
      'versions upload',
      'deployments list',
      'versions deploy',
      'forwarder',
      'check',
      'deployments list',
      'versions deploy',
      'check',
      'healthcheck',
      'initialize',
    ]);
    expect(mocks.session).toHaveBeenCalledWith('http://127.0.0.1:9191/');
    expect(mocks.teardown).toHaveBeenCalledOnce();
    expect(mocks.dispose).toHaveBeenCalledTimes(4);
  });

  it('waits for SystemRepo B after promotion before initializing added services', async () => {
    let firstAssignmentPoll!: () => void;
    const polling = new Promise<void>(resolve => {
      firstAssignmentPoll = resolve;
    });
    let calls = 0;
    mocks.check.mockImplementation(async () => {
      calls++;
      if (calls === 2) {
        vi.useFakeTimers();
        firstAssignmentPoll();
      }
      expect(mocks.initialize).not.toHaveBeenCalled();
      return {
        result: {
          _tag: 'Success',
          success: {
            workerVersionId: calls < 4 ? incumbentVersion : candidateVersion,
          },
        },
      };
    });
    const execution = Effect.runPromise(
      deployWranglerFn().pipe(Effect.provide(AsyncLive)),
    );
    await polling;
    await vi.advanceTimersByTimeAsync(2000);
    await execution;
    expect(mocks.check).toHaveBeenCalledTimes(4);
    expect(mocks.initialize).toHaveBeenCalledOnce();
  });

  it('keeps promoted B and skips initialization if SystemRepo never leaves A', async () => {
    let firstAssignmentPoll!: () => void;
    const polling = new Promise<void>(resolve => {
      firstAssignmentPoll = resolve;
    });
    let calls = 0;
    mocks.check.mockImplementation(async () => {
      calls++;
      if (calls === 2) {
        vi.useFakeTimers();
        firstAssignmentPoll();
      }
      return {
        result: {
          _tag: 'Success',
          success: { workerVersionId: incumbentVersion },
        },
      };
    });
    const execution = Effect.runPromise(
      deployWranglerFn().pipe(Effect.provide(AsyncLive), Effect.result),
    );
    await polling;
    await vi.advanceTimersByTimeAsync(180000);
    const result = await execution;
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'zerospin-deployment-version-assignment-pending' },
    });
    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(history.at(-1)?.versions).toEqual([
      { version_id: candidateVersion, percentage: 100 },
    ]);
    expect(order.filter(command => command === 'versions deploy')).toHaveLength(
      2,
    );
  });

  it('rejects an existing split rollout before upload', async () => {
    history[0]!.versions.push({ version_id: candidateVersion, percentage: 0 });
    await expect(
      Effect.runPromise(deployWranglerFn().pipe(Effect.provide(AsyncLive))),
    ).rejects.toMatchObject({ code: 'zerospin-deployment-split-rollout' });
    expect(order).toEqual(['deployments list']);
  });

  it('does not interpret an authentication failure as first deployment', async () => {
    failCommand = 'deployments list';
    await expect(
      Effect.runPromise(deployWranglerFn().pipe(Effect.provide(AsyncLive))),
    ).rejects.toMatchObject({ code: 'zerospin-wrangler-exited' });
    expect(order).toEqual(['deployments list']);
  });

  it.each(['empty', 'missing'])(
    'bootstraps an initial system from an explicit %s result before checking and initializing',
    async state => {
      history.splice(0);
      missingWorker = state === 'missing';
      await Effect.runPromise(
        deployWranglerFn().pipe(Effect.provide(AsyncLive)),
      );
      expect(history).toHaveLength(1);
      expect(history[0]?.versions).toEqual([
        { version_id: candidateVersion, percentage: 100 },
      ]);
      expect(order.indexOf('deploy')).toBeLessThan(order.indexOf('check'));
      expect(order.indexOf('check')).toBeLessThan(order.indexOf('initialize'));
    },
  );

  it('restores the incumbent on failed acceptance and preserves the domain error', async () => {
    mocks.check.mockResolvedValue({
      result: {
        _tag: 'Failure',
        failure: new ZerospinError({
          code: 'spec-conflict',
          message: 'locked definition changed',
        }).toJSON(),
      },
    });
    await expect(
      Effect.runPromise(deployWranglerFn().pipe(Effect.provide(AsyncLive))),
    ).rejects.toMatchObject({ code: 'spec-conflict' });
    expect(history.at(-1)?.versions).toEqual([
      { version_id: incumbentVersion, percentage: 100 },
    ]);
    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(mocks.teardown).toHaveBeenCalledOnce();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it('keeps an intervening deployment and refuses promotion', async () => {
    mocks.check.mockImplementation(async () => {
      history.push({
        id: 'other-operator',
        created_on: '2026-09-11T00:00:00Z',
        versions: [
          {
            version_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            percentage: 100,
          },
        ],
      });
      return {
        result: {
          _tag: 'Success',
          success: { workerVersionId: incumbentVersion },
        },
      };
    });
    await expect(
      Effect.runPromise(deployWranglerFn().pipe(Effect.provide(AsyncLive))),
    ).rejects.toMatchObject({ code: 'zerospin-deployment-changed' });
    expect(history.at(-1)?.id).toBe('other-operator');
    expect(order.filter(command => command === 'versions deploy')).toHaveLength(
      1,
    );
  });

  it('restores A if promotion fails after acceptance without attempting to undo accepted locks', async () => {
    promotionFails = true;
    await expect(
      Effect.runPromise(deployWranglerFn().pipe(Effect.provide(AsyncLive))),
    ).rejects.toMatchObject({ code: 'zerospin-wrangler-exited' });
    expect(mocks.check).toHaveBeenCalledOnce();
    expect(history.at(-1)?.versions).toEqual([
      { version_id: incumbentVersion, percentage: 100 },
    ]);
  });

  it('disposes Wrangler and restores the staged incumbent on interruption', async () => {
    let reachedCheck!: () => void;
    const checking = new Promise<void>(resolve => {
      reachedCheck = resolve;
    });
    mocks.check.mockImplementation(() => {
      reachedCheck();
      return new Promise(() => {});
    });
    const abort = new globalThis.AbortController();
    const execution = Effect.runPromise(
      deployWranglerFn().pipe(Effect.provide(AsyncLive)),
      { signal: abort.signal },
    );
    await checking;
    abort.abort();
    await expect(execution).rejects.toThrow();
    expect(history.at(-1)?.versions).toEqual([
      { version_id: incumbentVersion, percentage: 100 },
    ]);
    expect(mocks.teardown).toHaveBeenCalledOnce();
  });

  it.each(['SIGINT', 'SIGTERM', 'SIGHUP'])(
    'handles %s by cancelling work, disposing sessions, and restoring its staged deployment',
    async signal => {
      const previousListeners = process.listenerCount(signal);
      let reachedCheck!: () => void;
      const checking = new Promise<void>(resolve => {
        reachedCheck = resolve;
      });
      mocks.check.mockImplementation(() => {
        reachedCheck();
        return new Promise(() => {});
      });
      const execution = Effect.runPromise(
        deployWranglerFn().pipe(Effect.provide(AsyncLive)),
      );
      await checking;
      process.emit(signal);
      await expect(execution).rejects.toThrow();
      expect(history.at(-1)?.versions).toEqual([
        { version_id: incumbentVersion, percentage: 100 },
      ]);
      expect(mocks.dispose).toHaveBeenCalledOnce();
      expect(mocks.teardown).toHaveBeenCalledOnce();
      expect(process.listenerCount(signal)).toBe(previousListeners);
      expect(process.exitCode).toBe(1);
    },
  );

  it('reports rollback failures separately without hiding the rejected spec', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      mocks.check.mockImplementation(async () => {
        failCommand = 'versions deploy';
        return {
          result: {
            _tag: 'Failure',
            failure: new ZerospinError({
              code: 'spec-conflict',
              message: 'locked definition changed',
            }).toJSON(),
          },
        };
      });
      await expect(
        Effect.runPromise(deployWranglerFn().pipe(Effect.provide(AsyncLive))),
      ).rejects.toMatchObject({ code: 'spec-conflict' });
      expect(stderr.mock.calls.flat().join('')).toContain(
        'Deployment rollback failed',
      );
      expect(stderr.mock.calls.flat().join('')).toContain(
        `wrangler versions deploy ${incumbentVersion}@100%`,
      );
      expect(mocks.teardown).toHaveBeenCalledOnce();
    } finally {
      stderr.mockRestore();
    }
  });

  it('retries silent override fallback while preserving the exact HTTP body and headers', async () => {
    await Effect.runPromise(deployWranglerFn().pipe(Effect.provide(AsyncLive)));
    const { default: forwarder } = await import(
      `data:text/javascript;base64,${Buffer.from(forwarderSource).toString('base64')}`
    );
    const received: string[] = [];
    const remote = vi.fn(async (request: Request) => {
      expect(request.headers.get('authorization')).toBe('Bearer fixture');
      expect(request.headers.get('Cloudflare-Workers-Version-Overrides')).toBe(
        `zerospin-production-fixture="${candidateVersion}"`,
      );
      received.push(await request.text());
      return new Response('rpc-result', {
        headers: {
          'X-Zerospin-Worker-Version':
            received.length === 1 ? incumbentVersion : candidateVersion,
        },
      });
    });
    vi.useFakeTimers();
    const response = forwarder.fetch(
      new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { authorization: 'Bearer fixture' },
        body: 'exact-rpc-envelope',
      }),
      { PRODUCTION: { fetch: remote } },
    );
    await vi.runAllTimersAsync();
    expect(await (await response).text()).toBe('rpc-result');
    expect(received).toEqual(['exact-rpc-envelope', 'exact-rpc-envelope']);
  });

  it.each([null, incumbentVersion])(
    'rejects a missing or wrong version header after bounded propagation retries: %s',
    async header => {
      await Effect.runPromise(
        deployWranglerFn().pipe(Effect.provide(AsyncLive)),
      );
      const { default: forwarder } = await import(
        `data:text/javascript;base64,${Buffer.from(forwarderSource).toString('base64')}`
      );
      const remote = vi.fn(
        async () =>
          new Response('untrusted-rpc-result', {
            headers:
              header === null ? {} : { 'X-Zerospin-Worker-Version': header },
          }),
      );
      vi.useFakeTimers();
      const response = forwarder.fetch(
        new Request('http://localhost/rpc', {
          method: 'POST',
          body: 'envelope',
        }),
        { PRODUCTION: { fetch: remote } },
      );
      await vi.runAllTimersAsync();
      const failed = await response;
      expect(failed.status).toBe(502);
      expect(await failed.text()).not.toContain('untrusted-rpc-result');
      expect(remote).toHaveBeenCalledTimes(10);
    },
  );
});
