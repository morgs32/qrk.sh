import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { ZerospinError } from '@zerospin/error';
import { Effect, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import config from '../../test/config/zerospin.config';

import { seedFn } from './seedFn.js';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  aggregate: vi.fn(),
  service: vi.fn(),
  getSystemApi: vi.fn(),
  executeRpc: vi.fn(),
}));
vi.mock('../deploy/loadConfigFn.js', () => ({
  loadConfigFn: mocks.loadConfig,
}));
vi.mock('@zerospin/core/utils/executeRpc', () => ({
  executeRpc: mocks.executeRpc,
}));

const platform = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  AsyncLive,
);
const configRoot = new URL('../../test/config/', import.meta.url).pathname;
let directory: string;

beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv('ZEROSPIN_API_URL', undefined);
  vi.stubEnv('VITE_ZEROSPIN_API_URL', undefined);
  vi.stubEnv('NEXT_PUBLIC_ZEROSPIN_API_URL', undefined);
  mocks.executeRpc.mockImplementation(
    () => (callback: (gateway: unknown) => unknown) =>
      callback({ getSystemApi: mocks.getSystemApi }),
  );
  directory = await mkdtemp(join(configRoot, '.seed-test-'));
  mocks.loadConfig.mockReturnValue(
    Effect.succeed({
      config,
      zerospinApiUrl: 'https://fixture.test',
      zerospinSecretKey: 'fixture-key',
    }),
  );
  mocks.aggregate.mockReturnValue(Effect.void);
  mocks.service.mockReturnValue(Effect.void);
  mocks.getSystemApi.mockReturnValue({
    executeAggregateCommand: mocks.aggregate,
    executeServiceCommand: mocks.service,
  });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe('seed file execution', () => {
  it.each([
    [
      'https://generic.test',
      'https://vite.test',
      'https://next.test',
      'https://generic.test',
    ],
    [undefined, 'https://vite.test', 'https://next.test', 'https://vite.test'],
    [undefined, undefined, 'https://next.test', 'https://next.test'],
    [undefined, undefined, undefined, 'https://fixture.test'],
  ])(
    'selects API URL %s / %s / %s as %s',
    async (generic, vite, next, expected) => {
      vi.stubEnv('ZEROSPIN_API_URL', generic);
      vi.stubEnv('VITE_ZEROSPIN_API_URL', vite);
      vi.stubEnv('NEXT_PUBLIC_ZEROSPIN_API_URL', next);

      await Effect.runPromise(
        seedFn({ filePath: './seeds.ts', cwd: configRoot }).pipe(
          Effect.provide(platform),
        ),
      );

      expect(mocks.executeRpc).toHaveBeenCalledExactlyOnceWith(expected);
    },
  );

  it('loads a relative TypeScript path and submits complete commands with owner versions', async () => {
    const result = await Effect.runPromise(
      seedFn({ filePath: './seeds.ts', cwd: configRoot }).pipe(
        Effect.provide(platform),
      ),
    );
    expect(result).toEqual({ commandsSubmitted: 2 });
    expect(mocks.loadConfig).toHaveBeenCalledWith(configRoot);
    expect(mocks.getSystemApi).toHaveBeenCalledWith({
      zerospinSecretKey: 'fixture-key',
    });
    expect(mocks.aggregate).toHaveBeenCalledExactlyOnceWith({
      aggregateVersion: '2.0.0',
      command: expect.objectContaining({
        aggregateVersion: '2.0.0',
        aggregateName: 'user',
        systemName: 'typed-config-fixture',
        commandName: 'createUser',
        contractVersion: '1.0.0',
        sessionId: null,
        frontendName: null,
        userId: null,
        pushIndex: null,
        payload: JSON.stringify({ name: 'Ada' }),
      }),
    });
    expect(mocks.service).toHaveBeenCalledExactlyOnceWith({
      serviceVersion: '2.0.0',
      command: expect.objectContaining({
        serviceVersion: '2.0.0',
        serviceName: 'app',
        commandName: 'createProduct',
        contractVersion: '1.0.0',
        payload: JSON.stringify({ name: 'Notebook' }),
      }),
    });
  });

  it('ignores non-Effect exports and the default export', async () => {
    const filePath = join(directory, 'seeds.ts');
    await writeFile(
      filePath,
      `export { notebook } from '../seeds.ts'; export const description = 'fixture'; export { ada as default } from '../seeds.ts';`,
    );
    const result = await Effect.runPromise(
      seedFn({ filePath, cwd: configRoot }).pipe(Effect.provide(platform)),
    );
    expect(result.commandsSubmitted).toBe(1);
    expect(mocks.aggregate).not.toHaveBeenCalled();
    expect(mocks.service).toHaveBeenCalledOnce();
  });

  for (const [name, contents, code] of [
    ['missing file', null, 'seed-file-missing'],
    ['import failure', 'throw new Error("import-broke")', 'seed-load-failed'],
    ['no commands', 'export const title = "empty";', 'seed-no-commands'],
    [
      'failed command Effect',
      'import { Effect } from "effect"; export const broken = Effect.fail("seed-broke");',
      'seed-command-invalid',
    ],
    [
      'invalid command value',
      'import { Effect } from "effect"; export const broken = Effect.succeed({});',
      'seed-command-invalid',
    ],
    [
      'unknown service',
      'import { Effect } from "effect"; import { notebook } from "../seeds.ts"; export const broken = notebook.pipe(Effect.map(command => ({ ...command, serviceName: "missing" })));',
      'seed-command-invalid',
    ],
    [
      'unknown owner version',
      'import { Effect } from "effect"; import { notebook } from "../seeds.ts"; export const broken = notebook.pipe(Effect.map(command => ({ ...command, serviceVersion: "99.0.0" })));',
      'seed-command-invalid',
    ],
    [
      'wrong system',
      'import { Effect } from "effect"; import { ada } from "../seeds.ts"; export const broken = ada.pipe(Effect.map(command => ({ ...command, systemName: "other" })));',
      'seed-command-invalid',
    ],
    [
      'invalid payload',
      'import { Effect } from "effect"; import { notebook } from "../seeds.ts"; export const broken = notebook.pipe(Effect.map(command => ({ ...command, payload: { name: 42 } })));',
      null,
    ],
  ]) {
    it(`rejects ${name} before submitting any commands`, async () => {
      const filePath = join(directory, 'seeds.ts');
      if (contents !== null) {
        await writeFile(
          filePath,
          `export { ada } from '../seeds.ts';\n${contents}`,
        );
      }
      // Empty modules must not acquire a command from the common valid export.
      if (name === 'no commands' && contents !== null) {
        await writeFile(filePath, contents);
      }
      const failure = await Effect.runPromise(
        seedFn({ filePath, cwd: configRoot }).pipe(
          Effect.flip,
          Effect.provide(platform),
        ),
      );
      if (code !== null) expect(failure.code).toBe(code);
      expect(mocks.getSystemApi).not.toHaveBeenCalled();
    });
  }

  it('reports submission failures', async () => {
    mocks.service.mockReturnValue(
      Effect.fail(new ZerospinError({ code: 'fixture-submit-failed' })),
    );
    const failure = await Effect.runPromise(
      seedFn({ filePath: './seeds.ts', cwd: configRoot }).pipe(
        Effect.flip,
        Effect.provide(platform),
      ),
    );
    expect(failure.code).toBe('seed-submit-failed');
  });
});
