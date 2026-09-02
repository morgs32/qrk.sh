import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import type {} from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { ZerospinError } from '@zerospin/error';
import { Effect, Layer } from 'effect';
import { ChildProcess } from 'effect/unstable/process';

import { loadZerospinConfigFn } from '../deploy/loadZerospinConfigFn.js';

const require = createRequire(import.meta.url);
const platformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

export const e2eFn = Effect.fn('e2eFn')(function* () {
  const cwd = process.cwd();
  const config = yield* loadZerospinConfigFn(cwd).pipe(
    Effect.provide(platformLayer),
  );
  const systemModulePath = path.resolve(cwd, config.entry);
  const vitestConfigPath = path.join(cwd, 'vitest.zerospin.config.ts');

  yield* makeAsync(
    () => fs.access(vitestConfigPath),
    cause =>
      new ZerospinError({
        code: 'zerospin-e2e-config-not-found',
        message:
          'Could not find vitest.zerospin.config.ts in the current project.',
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
  );

  const vitestPackageRoot = path.dirname(
    require.resolve('vitest/package.json'),
  );
  const vitestBinPath = path.join(vitestPackageRoot, 'vitest.mjs');
  const exitCode = yield* ChildProcess.make(
    process.execPath,
    [vitestBinPath, 'run', '--config', vitestConfigPath],
    {
      cwd,
      env: {
        ...process.env,
        ZEROSPIN_E2E_SYSTEM_MODULE_PATH: systemModulePath,
      },
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    },
  ).pipe(
    Effect.flatMap(process => process.exitCode),
    Effect.scoped,
    Effect.mapError(
      cause =>
        new ZerospinError({
          code: 'zerospin-e2e-run-failed',
          message: 'Failed to run zerospin e2e.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    ),
  );

  if (exitCode !== 0) {
    return yield* new ZerospinError({
      code: 'zerospin-e2e-failed',
      message: `zerospin e2e failed with exit code ${exitCode}.`,
      extra: {
        vitestConfigPath,
      },
    });
  }

  return {
    vitestConfigPath,
  };
});
