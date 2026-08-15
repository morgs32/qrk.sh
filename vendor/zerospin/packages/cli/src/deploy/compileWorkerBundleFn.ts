import { createRequire } from 'node:module';
import path from 'node:path';

import { Path, type FileSystem } from '@effect/platform';
import { type Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import type { ISystemConfig } from '@zerospin/core/system/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';
import * as esbuild from 'esbuild';

import { loadSystemFn } from './loadSystemFn.js';

const require = createRequire(import.meta.url);

export const compileWorkerBundleFn = Effect.fn('compileWorkerBundleFn')(
  function* (config: ISystemConfig): Effect.fn.Return<
    {
      workerBundle: string;
      systemSpec: ReturnType<typeof makeSystemSpec>;
      systemVersion: string;
    },
    IAnyError,
    Path.Path | FileSystem.FileSystem | Async
  > {
    const cwd = process.cwd();
    const pathApi = yield* Path.Path;
    const systemPath = pathApi.resolve(cwd, config.entry);
    const system = yield* loadSystemFn(config, cwd);

    const workerBundle = yield* makeAsync(async () => {
      const workerEntryPath =
        require.resolve('@zerospin/production-worker/ProductionWorker');
      const emptySeedsPath = require.resolve(
        path.join(path.dirname(workerEntryPath), 'emptySeeds.js'),
      );
      const result = await esbuild.build({
        bundle: true,
        conditions: ['workerd', 'browser', 'import', 'default'],
        entryPoints: [workerEntryPath],
        format: 'esm',
        logLevel: 'silent',
        minify: false,
        platform: 'browser',
        plugins: [
          {
            name: 'static-zerospin-worker',
            setup(build) {
              build.onResolve({ filter: /^system$/ }, () => ({
                path: systemPath,
              }));
              build.onResolve({ filter: /^seeds$/ }, () => ({
                path: emptySeedsPath,
              }));
              build.onResolve({ filter: /^cloudflare:/ }, args => ({
                external: true,
                path: args.path,
              }));
            },
          },
        ],
        target: 'esnext',
        write: false,
      });
      const output = result.outputFiles[0];
      if (output === undefined) {
        throw new Error('esbuild produced no output for worker bundle');
      }
      return output.text;
    }).pipe(
      Effect.mapError(cause => {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        if (error.message.includes('"system" is not exported')) {
          return new ZerospinError({
            code: 'system-not-exported',
            message: 'System not exported',
            cause: ZerospinError.prettyUnknownFailure(error),
            extra: { systemEntry: config.entry },
          });
        }
        return new ZerospinError({
          code: 'system-bundle-failed',
          message: 'Failed to bundle the static System Worker',
          cause: ZerospinError.prettyUnknownFailure(error),
          extra: { systemEntry: config.entry },
        });
      }),
    );

    return {
      workerBundle,
      systemSpec: makeSystemSpec({ system }),
      systemVersion: system.version,
    };
  },
);
