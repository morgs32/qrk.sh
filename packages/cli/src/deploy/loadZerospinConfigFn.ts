import { FileSystem, Path } from '@effect/platform';
/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded type; any is intentional for satisfies */
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { type ISystemConfig } from '@zerospin/core/system/types';
import { ZerospinConfigSchema } from '@zerospin/core/system/ZerospinConfigSchema';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { loadConfig } from 'c12';
import { Effect, Schema } from 'effect';
import { createJiti } from 'jiti';

import { jitiAliasesFromTsconfigPaths } from './jitiAliasesFromTsconfigPaths.js';

const readErrnoCode = (e: unknown): string | undefined => {
  if (!e || typeof e !== 'object') return undefined;
  if ('code' in e && typeof e.code === 'string') {
    return e.code;
  }
  return undefined;
};

/** Extensions c12/jiti will try (order may vary per c12). */
const SUPPORTED_EXTENSIONS = [
  '.js',
  '.ts',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
] as const;

/**
 * Load zerospin.config.* using c12 (same approach as Prisma). Supports .js, .ts, .mjs, .cjs, .mts, .cts
 * without a Node loader (c12 discovers and merges; jiti imports). Requires Path + FileSystem (e.g. `NodePath.layer` + `NodeFileSystem.layer`).
 */
export const loadZerospinConfigFn = Effect.fn('loadZerospinConfigFn')(
  function* (
    cwd: string = process.cwd(),
  ): Effect.fn.Return<
    ISystemConfig,
    IAnyError,
    Async | FileSystem.FileSystem | Path.Path
  > {
    const pathApi = yield* Path.Path;
    yield* FileSystem.FileSystem;
    type LoadResult = { config: unknown; configFile?: string };
    const jitiAliases = yield* jitiAliasesFromTsconfigPaths(cwd).pipe(
      Effect.mapError(
        cause =>
          new ZerospinError({
            code: 'deploy-invalid-config',
            message: 'Failed to read tsconfig.json for jiti path aliases.',
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
      ),
    );

    const result = (yield* makeAsync(() => {
      // c12 tries native import before its jiti fallback. Force every supported
      // config format through jiti so typeless packages do not emit Node's
      // MODULE_TYPELESS_PACKAGE_JSON warning before the fallback can run.
      const jiti = createJiti(pathApi.join(cwd, 'zerospin.config'), {
        interopDefault: true,
        moduleCache: false,
        extensions: [...SUPPORTED_EXTENSIONS],
        alias: jitiAliases,
        tryNative: false,
      });

      return loadConfig({
        cwd,
        name: 'zerospin',
        configFile: 'zerospin.config',
        dotenv: false,
        rcFile: false,
        giget: false,
        extend: false,
        packageJson: false,
        import: configPath => jiti.import(configPath),
      });
    }).pipe(
      Effect.catchAll((error: unknown) =>
        Effect.gen(function* () {
          const base =
            error instanceof Error ? error : new Error(String(error));

          const code =
            readErrnoCode(base) ??
            ('cause' in base
              ? readErrnoCode((base as { cause?: unknown }).cause)
              : undefined);

          if (code === 'MODULE_NOT_FOUND') {
            return yield* new ZerospinError({
              code: 'deploy-invalid-config',
              message: `${base.message} Zerospin maps tsconfig.compilerOptions.paths into jiti for config load; verify cwd/tsconfig.json.`,
              cause: ZerospinError.prettyUnknownFailure(base),
            });
          }

          const pretty = ZerospinError.prettyUnknownFailure(error);
          const message =
            pretty.split('\n').find(line => line.trim().length > 0) ??
            `Failed to load zerospin.config: ${base.message}`;
          return yield* new ZerospinError({
            code: 'deploy-invalid-config',
            message,
            cause: pretty,
          });
        }),
      ),
    )) as LoadResult;

    if (!result.configFile) {
      return yield* new ZerospinError({
        code: 'deploy-invalid-config',
        message: `No zerospin.config file found in ${cwd}. Create zerospin.config.ts (or .js, .mjs, .cjs, .mts, .cts) with a default export.`,
      });
    }
    const raw = result.config as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') {
      return yield* new ZerospinError({
        code: 'deploy-invalid-config',
        message: `zerospin.config must export a default object.`,
      });
    }

    // c12 merges with defu-style semantics and omits keys whose value is `null`, so a
    // `makeSystemConfig({ env: undefined })` export loses `env` even though ISystemConfig requires it.
    const configForValidation: {
      [K in keyof ISystemConfig]: unknown | null;
    } = {
      entry: raw['entry'],
      environmentId: raw['environmentId'] ?? null,
      env: raw['env'] ?? null,
      seeds: raw['seeds'] ?? null,
    };

    return yield* Schema.validate(ZerospinConfigSchema)(
      configForValidation as typeof ZerospinConfigSchema.Type,
      { onExcessProperty: 'ignore' },
    ).pipe(
      Effect.mapError(
        cause =>
          new ZerospinError({
            code: 'deploy-invalid-config',
            message: `Failed to load zerospin config: ${cause.message}`,
          }),
      ),
    );
  },
);
