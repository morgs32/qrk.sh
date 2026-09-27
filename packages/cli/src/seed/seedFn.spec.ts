import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { seeds } from '@zerospin/fixtures/cli/seeds';
import { Effect, Exit, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import { seedFn } from './seedFn.js';

const rpc = vi.hoisted(() => ({
  aggregate: vi.fn(),
  service: vi.fn(),
  select: vi.fn(),
}));

vi.mock(
  '@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession',
  () => ({
    newSyncRpcSession: () => ({
      getSystemApi: rpc.select,
      [Symbol.dispose]() {
        return undefined;
      },
    }),
  }),
);

const fixtureDirectory = fileURLToPath(
  new URL('../../../fixtures/src/cli/', import.meta.url),
);
const layers = Layer.mergeAll(AsyncLive, NodeFileSystem.layer, NodePath.layer);
let cwd: string;

beforeEach(async () => {
  vi.stubEnv('ZEROSPIN_SECRET_KEY', 'seed-test-secret');
  vi.stubEnv('ZEROSPIN_API_URL', 'http://seed.test');
  rpc.aggregate.mockReset().mockResolvedValue({
    result: { _tag: 'Success', success: {} },
    link: null,
  });
  rpc.service.mockReset().mockResolvedValue({
    result: { _tag: 'Success', success: {} },
    link: null,
  });
  rpc.select.mockReset().mockReturnValue({
    executeAggregateCommand: rpc.aggregate,
    executeServiceCommand: rpc.service,
  });
  cwd = await mkdtemp(`${fixtureDirectory}../seed-test-`);
  await Promise.all(
    ['zerospin.config.ts', 'seeds.ts'].map(file =>
      copyFile(`${fixtureDirectory}${file}`, `${cwd}/${file}`),
    ),
  );
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(cwd, { recursive: true, force: true });
});

const runSeed = () =>
  seedFn({ cwd, filePath: 'seeds.ts' }).pipe(Effect.provide(layers));

function writeSeeds(commands: ReadonlyArray<unknown>) {
  return Effect.promise(() =>
    writeFile(
      `${cwd}/seeds.ts`,
      `export const seeds = ${JSON.stringify(commands)};`,
    ),
  );
}

function expectNoSubmission() {
  expect(rpc.select).not.toHaveBeenCalled();
  expect(rpc.aggregate).not.toHaveBeenCalled();
  expect(rpc.service).not.toHaveBeenCalled();
}

describe('seedFn', () => {
  it.effect(
    'loads authored fixtures and submits encoded aggregate and service commands',
    () =>
      Effect.gen(function* () {
        expect(yield* runSeed()).toEqual({ commandsSubmitted: 2 });
        expect(rpc.select).toHaveBeenCalledWith({
          zerospinSecretKey: 'seed-test-secret',
        });
        expect(rpc.aggregate).toHaveBeenCalledExactlyOnceWith({
          traceContext: null,
          args: [
            {
              aggregateVersion: '2.0.0',
              command: {
                ...seeds[0],
                id: expect.stringMatching(/^cmd_/),
                payload: JSON.stringify({ name: 'Ada' }),
              },
            },
          ],
        });
        expect(rpc.service).toHaveBeenCalledExactlyOnceWith({
          traceContext: null,
          args: [
            {
              serviceVersion: '2.0.0',
              command: {
                ...seeds[1],
                id: expect.stringMatching(/^cmd_/),
                payload: JSON.stringify({ name: 'Notebook' }),
              },
            },
          ],
        });
      }),
  );

  for (const [name, commands, code] of [
    [
      'unknown aggregate contract',
      [{ ...seeds[0], commandName: 'unknown' }],
      'seed-command-invalid',
    ],
    [
      'unknown service contract',
      [seeds[0], { ...seeds[1], commandName: 'unknown' }],
      'seed-command-invalid',
    ],
    [
      'mismatched actor version',
      [{ ...seeds[0], actorVersion: '9.0.0' }],
      'seed-command-invalid',
    ],
    [
      'missing aggregate provenance',
      [{ ...seeds[0], claims: undefined }],
      'seed-command-invalid',
    ],
    [
      'invalid aggregate payload',
      [{ ...seeds[0], payload: { name: 42 } }],
      'encode-command-payload-failed',
    ],
    [
      'invalid service payload',
      [seeds[0], { ...seeds[1], payload: { name: 42 } }],
      'encode-command-payload-failed',
    ],
    ['empty seeds', [], 'seed-no-commands'],
  ] as const) {
    it.effect(`rejects ${name} before submission`, () =>
      Effect.gen(function* () {
        yield* writeSeeds(commands);
        const exit = yield* Effect.exit(runSeed());
        expect(Exit.isFailure(exit)).toBe(true);
        expect(exit).toMatchObject({
          cause: { reasons: [{ error: { code } }] },
        });
        expectNoSubmission();
      }),
    );
  }

  it.effect('rejects a missing seeds export before submission', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        writeFile(`${cwd}/seeds.ts`, 'export const other = [];'),
      );
      const exit = yield* Effect.exit(runSeed());
      expect(Exit.isFailure(exit)).toBe(true);
      expect(exit).toMatchObject({
        cause: { reasons: [{ error: { code: 'seed-no-commands' } }] },
      });
      expectNoSubmission();
    }),
  );
});
