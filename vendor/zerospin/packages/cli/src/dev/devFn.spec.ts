import { EventEmitter } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import * as NodeTerminal from '@effect/platform-node-shared/NodeTerminal';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { ZerospinError } from '@zerospin/error';
import { Effect, Fiber, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { devFn } from './devFn.js';

const mocks = vi.hoisted(() => ({
  checkSystemSpec: vi.fn(),
  getSystemApi: vi.fn(),
  startWorker: vi.fn(),
  teardown: vi.fn(),
  drained: vi.fn(),
  getVarsForDev: vi.fn(),
  systemName: 'dev-test',
  disposeSession: vi.fn(),
}));
vi.mock('../deploy/loadZerospinConfigFn.js', () => ({
  loadZerospinConfigFn: () =>
    Effect.succeed({
      system: { name: mocks.systemName },
      systemId: 'sys_test',
    }),
}));
vi.mock('@zerospin/core/utils/newSyncRpcSession', () => ({
  newSyncRpcSession: () => ({
    getSystemApi: mocks.getSystemApi,
    [Symbol.dispose]: mocks.disposeSession,
  }),
}));

const platform = Layer.mergeAll(
  AsyncLive,
  NodeFileSystem.layer,
  NodePath.layer,
  NodeTerminal.layer,
);
let directory: string;
let environment: EventEmitter;

beforeEach(async () => {
  vi.resetAllMocks();
  mocks.systemName = 'dev-test';
  directory = await mkdtemp(
    join(new URL('../../test/', import.meta.url).pathname, '.dev-test-'),
  );
  await mkdir(join(directory, 'node_modules', 'wrangler'), { recursive: true });
  await writeFile(
    join(directory, 'node_modules', 'wrangler', 'index.js'),
    'module.exports = { unstable_DevEnv: globalThis[Symbol.for("zerospin.dev-test")], unstable_getVarsForDev: globalThis[Symbol.for("zerospin.dev-env-test")] };',
  );
  Reflect.set(
    globalThis,
    Symbol.for('zerospin.dev-env-test'),
    mocks.getVarsForDev,
  );
  mocks.getVarsForDev.mockReturnValue({
    EXISTING: { type: 'secret_text', value: 'value' },
    ZEROSPIN_SYSTEM_ID: { type: 'secret_text', value: 'sys_wrong' },
  });
  environment = new EventEmitter();
  Reflect.set(
    globalThis,
    Symbol.for('zerospin.dev-test'),
    class {
      constructor() {
        return Object.assign(environment, {
          proxy: { runtimeMessageMutex: { drained: mocks.drained } },
          startWorker: mocks.startWorker,
          teardown: mocks.teardown,
        });
      }
    },
  );
  mocks.startWorker.mockImplementation(async () => {
    environment.emit('reloadComplete');
    return { url: Promise.resolve(new URL('http://127.0.0.1:3210')) };
  });
  mocks.teardown.mockResolvedValue(undefined);
  mocks.drained.mockResolvedValue(undefined);
  mocks.getSystemApi.mockReturnValue({
    checkSystemSpec: mocks.checkSystemSpec,
  });
  mocks.checkSystemSpec.mockResolvedValue({
    result: { _tag: 'Success', success: undefined },
    link: null,
  });
  vi.spyOn(process, 'cwd').mockReturnValue(directory);
});

afterEach(async () => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, Symbol.for('zerospin.dev-test'));
  Reflect.deleteProperty(globalThis, Symbol.for('zerospin.dev-env-test'));
  await rm(directory, { recursive: true, force: true });
});

describe('development spec acceptance', () => {
  it('checks the initial bundle and every compatible reload, preserving config and scoped persistence', async () => {
    const fiber = Effect.runFork(
      devFn({ clean: false, port: 3210 }).pipe(Effect.provide(platform)),
    );
    await vi.waitFor(() =>
      expect(mocks.checkSystemSpec).toHaveBeenCalledTimes(1),
    );
    expect(mocks.checkSystemSpec).toHaveBeenCalledWith({
      traceContext: null,
      args: [],
    });
    expect(mocks.getSystemApi).toHaveBeenCalledWith({
      zerospinSecretKey: 'sk_dev',
    });
    expect(mocks.drained).toHaveBeenCalledTimes(1);
    const options = mocks.startWorker.mock.calls[0]?.[0];
    expect(options.dev).toEqual({
      server: { hostname: '127.0.0.1', port: 3210 },
      persist: join(directory, '.wrangler/zerospin/dev-worker/sys_test'),
      watch: true,
    });
    const config = JSON.parse(await readFile(options.config, 'utf8'));
    expect(config.alias.system).toContain('/.wrangler/zerospin/entry-');
    expect(config.name).toBe('zerospin-dev-test');
    expect(config.main).toBe(options.entrypoint);
    expect(mocks.getVarsForDev).toHaveBeenCalledWith(
      join(directory, 'zerospin.config.ts'),
      undefined,
      {},
      undefined,
      true,
    );
    expect(options.bindings.EXISTING).toEqual({
      type: 'secret_text',
      value: 'value',
    });
    expect(options.bindings.ZEROSPIN_SYSTEM_ID.value).toBe('sys_test');
    expect(config.vars).toEqual({
      ZEROSPIN_SYSTEM_ID: 'sys_test',
      ZEROSPIN_ENVIRONMENT: 'dev',
    });
    expect(config.exports.SystemRepo).toEqual({
      type: 'durable-object',
      storage: 'sqlite',
    });
    expect(config.durable_objects.bindings).toHaveLength(13);
    expect(config.migrations).toBeUndefined();
    environment.emit('reloadComplete');
    environment.emit('reloadComplete');
    await vi.waitFor(() =>
      expect(mocks.checkSystemSpec).toHaveBeenCalledTimes(3),
    );
    environment.emit('teardown');
    expect(await Effect.runPromise(Fiber.join(fiber))).toEqual({ port: 3210 });
    expect(mocks.teardown).toHaveBeenCalledOnce();
    expect(mocks.disposeSession).toHaveBeenCalled();
    expect(
      (await readdir(join(directory, '.wrangler/zerospin'))).filter(file =>
        file.startsWith('entry-'),
      ),
    ).toEqual([]);
  });

  it.each(['initial', 'reload'])(
    'rejects an incompatible %s and disposes Wrangler',
    async stage => {
      const rejected = new ZerospinError({ code: 'system-spec-mismatch' });
      if (stage === 'initial') {
        mocks.checkSystemSpec.mockResolvedValue({
          result: { _tag: 'Failure', failure: rejected },
          link: null,
        });
      }
      const promise = Effect.runPromise(
        devFn({ clean: false, port: 3210 }).pipe(
          Effect.provide(platform),
          Effect.flip,
        ),
      );
      if (stage === 'reload') {
        await vi.waitFor(() =>
          expect(mocks.checkSystemSpec).toHaveBeenCalledTimes(1),
        );
        mocks.checkSystemSpec.mockResolvedValue({
          result: { _tag: 'Failure', failure: rejected },
          link: null,
        });
        environment.emit('reloadComplete');
      }
      expect(await promise).toMatchObject({ code: rejected.code });
      expect(mocks.teardown).toHaveBeenCalledOnce();
      expect(mocks.disposeSession).toHaveBeenCalled();
      expect(
        (await readdir(join(directory, '.wrangler/zerospin'))).filter(file =>
          file.startsWith('entry-'),
        ),
      ).toEqual([]);
    },
  );

  it('stops and disposes a pending acceptance request', async () => {
    mocks.checkSystemSpec.mockImplementation(() => new Promise(() => {}));
    const fiber = Effect.runFork(
      devFn({ clean: false, port: 3210 }).pipe(Effect.provide(platform)),
    );
    await vi.waitFor(() =>
      expect(mocks.checkSystemSpec).toHaveBeenCalledOnce(),
    );
    environment.emit('teardown');
    expect(await Effect.runPromise(Fiber.join(fiber))).toEqual({ port: 3210 });
    expect(mocks.disposeSession).toHaveBeenCalledOnce();
    expect(mocks.teardown).toHaveBeenCalledOnce();
  });

  it('disposes the environment when Wrangler reports an error during startup', async () => {
    mocks.startWorker.mockImplementation(() => new Promise(() => {}));
    const promise = Effect.runPromise(
      devFn({ clean: false, port: 3210 }).pipe(
        Effect.provide(platform),
        Effect.flip,
      ),
    );
    await vi.waitFor(() => expect(mocks.startWorker).toHaveBeenCalledOnce());
    environment.emit('error', new Error('startup-broke'));
    expect(await promise).toMatchObject({
      code: 'zerospin-dev-wrangler-failed',
    });
    expect(mocks.teardown).toHaveBeenCalledOnce();
    expect(mocks.checkSystemSpec).not.toHaveBeenCalled();
  });

  it('retains other signal and exit listeners while taking ownership of new Miniflare exit hooks', async () => {
    const runCallbacks = vi.fn();
    const existing = function onSignalTerm() {
      runCallbacks();
      process.exit(128 + 15);
    };
    const ordinary = function onSignalTerm() {
      return 0;
    };
    const exit = () => {};
    const hooks = [
      {
        signal: 'SIGINT',
        listener: function onSignalInt() {
          runCallbacks();
          process.exit(128 + 2);
        },
      },
      {
        signal: 'SIGTERM',
        listener: function onSignalTerm() {
          runCallbacks();
          process.exit(128 + 15);
        },
      },
      {
        signal: 'SIGHUP',
        listener: function onSignalHup() {
          runCallbacks();
          process.exit(128 + 1);
        },
      },
    ];
    process.on('SIGTERM', existing);
    process.on('exit', exit);
    const observers = process.listeners('newListener');
    mocks.startWorker.mockImplementation(async () => {
      process.on('SIGTERM', ordinary);
      for (const hook of hooks) process.on(hook.signal, hook.listener);
      environment.emit('reloadComplete');
      return { url: Promise.resolve(new URL('http://127.0.0.1:3210')) };
    });
    const fiber = Effect.runFork(
      devFn({ clean: false, port: 3210 }).pipe(Effect.provide(platform)),
    );
    try {
      await vi.waitFor(() =>
        expect(mocks.checkSystemSpec).toHaveBeenCalledOnce(),
      );
      for (const hook of hooks) {
        expect(process.listeners(hook.signal)).not.toContain(hook.listener);
      }
      expect(process.listeners('SIGTERM')).toContain(existing);
      expect(process.listeners('SIGTERM')).toContain(ordinary);
      expect(process.listeners('exit')).toContain(exit);
      environment.emit('teardown');
      await Effect.runPromise(Fiber.join(fiber));
      expect(process.listeners('newListener')).toEqual(observers);
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber));
      process.off('SIGTERM', existing);
      process.off('SIGTERM', ordinary);
      process.off('exit', exit);
      for (const hook of hooks) process.off(hook.signal, hook.listener);
    }
  });

  it.each(['UPPERCASE', 'contains space', 'x'.repeat(64)])(
    'rejects an invalid derived Worker name: %s',
    async systemName => {
      mocks.systemName = systemName;
      const failure = await Effect.runPromise(
        devFn({ clean: false, port: 3210 }).pipe(
          Effect.provide(platform),
          Effect.flip,
        ),
      );
      expect(failure.code).toBe('zerospin-worker-name-invalid');
      expect(mocks.startWorker).not.toHaveBeenCalled();
      expect(await readdir(join(directory, '.wrangler/zerospin'))).toEqual([]);
    },
  );

  it('cleans only the selected system when --clean is requested', async () => {
    const persistence = join(directory, '.wrangler/zerospin/dev-worker');
    await mkdir(join(persistence, 'sys_test'), { recursive: true });
    await mkdir(join(persistence, 'sys_other'), { recursive: true });
    mocks.checkSystemSpec.mockResolvedValue({
      result: {
        _tag: 'Failure',
        failure: new ZerospinError({ code: 'stop-test' }),
      },
      link: null,
    });
    await Effect.runPromise(
      devFn({ clean: true, port: 3210 }).pipe(
        Effect.provide(platform),
        Effect.flip,
      ),
    );
    expect(await readdir(persistence)).toEqual(['sys_other']);
  });

  it('cleans the environment and generated files when interrupted', async () => {
    const fiber = Effect.runFork(
      devFn({ clean: false, port: 3210 }).pipe(Effect.provide(platform)),
    );
    await vi.waitFor(() =>
      expect(mocks.checkSystemSpec).toHaveBeenCalledTimes(1),
    );
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(mocks.teardown).toHaveBeenCalledOnce();
    expect(mocks.disposeSession).toHaveBeenCalled();
    expect(
      (await readdir(join(directory, '.wrangler/zerospin'))).filter(file =>
        file.startsWith('entry-'),
      ),
    ).toEqual([]);
  });
});
