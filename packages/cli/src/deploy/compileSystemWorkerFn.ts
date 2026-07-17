import { createRequire } from 'node:module';

import { Path } from '@effect/platform';
import { type Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ISystemConfig } from '@zerospin/core/system/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';
import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);

function compileSystemWorkerPlugins(systemPath: string): esbuild.Plugin[] {
  return [
    {
      name: 'system-worker-compile',
      setup(build) {
        build.onResolve({ filter: /^system$/ }, () => ({
          path: systemPath,
        }));
        build.onResolve({ filter: /^cloudflare:/ }, args => ({
          external: true,
          path: args.path,
        }));
      },
    },
  ];
}

/**
 * Bundle the worker entrypoint (SystemWorker) with esbuild; resolves virtual 'system' to the user's system entry (config.entry).
 * Returns the compiled ESM string (full worker bundle). systemName is loaded separately via LoadSystem/loadSystemFn.
 * Requires Path (provide NodePath at the edge).
 */

export const compileSystemWorkerFn = Effect.fn('compileSystemWorkerFn')(
  function* (config: ISystemConfig): Effect.fn.Return<
    { compiledSystemWorker: string },
    //
    IAnyError,
    Path.Path | Async
  > {
    const cwd = process.cwd();
    const pathApi = yield* Path.Path;
    const systemPath = pathApi.resolve(cwd, config.entry);
    return yield* makeAsync(async () => {
      const workerEntryPath = require.resolve('system-worker');
      const result = await esbuild.build({
        bundle: true,
        conditions: ['workerd', 'browser', 'import', 'default'],
        entryPoints: [workerEntryPath],
        format: 'esm',
        logLevel: 'silent',
        minify: false,
        platform: 'browser',
        plugins: compileSystemWorkerPlugins(systemPath),
        target: 'esnext',
        write: false,
      });
      const output = result.outputFiles[0];
      if (!output) {
        throw new Error('esbuild produced no output for worker bundle');
      }
      return {
        compiledSystemWorker: output.text,
      };
    }).pipe(
      Effect.mapError(cause => {
        const error = (() => {
          if (cause instanceof Error && !(cause instanceof ZerospinError)) {
            return cause;
          }
          if (cause instanceof ZerospinError) {
            const nested = cause.cause;
            if (typeof nested === 'string' && nested.length > 0) {
              return new Error(nested);
            }
            return new Error(cause.message);
          }
          return new Error(String(cause));
        })();
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
          message: 'Failed to bundle worker',
          cause: ZerospinError.prettyUnknownFailure(error),
          extra: { systemEntry: config.entry },
        });
      }),
    );
  },
);
