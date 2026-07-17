import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import type {} from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { ZerospinError } from '@zerospin/error';
import { Effect, Layer } from 'effect';

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
  const exitCode = yield* makeAsync(
    () =>
      new Promise<number>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [vitestBinPath, 'run', '--config', vitestConfigPath],
          {
            cwd,
            env: {
              ...process.env,
              ZEROSPIN_E2E_DEPLOY_NAME: 'happy_blue_whale_ab',
              ZEROSPIN_E2E_SYSTEM_MODULE_PATH: systemModulePath,
            },
            stdio: 'inherit',
          },
        );
        child.on('error', reject);
        child.on('close', (code, signal) => {
          if (signal !== null) {
            reject(new Error(`Vitest exited from signal ${signal}.`));
            return;
          }
          resolve(code ?? 1);
        });
      }),
    cause =>
      new ZerospinError({
        code: 'zerospin-e2e-run-failed',
        message: 'Failed to run zerospin e2e.',
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
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
