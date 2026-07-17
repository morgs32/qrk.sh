import { Path, type FileSystem } from '@effect/platform';
import { type Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ISystem, ISystemConfig } from '@zerospin/core/system/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { createJiti } from 'jiti';

import { jitiAliasesFromTsconfigPaths } from './jitiAliasesFromTsconfigPaths.js';

const ModuleSchema = Schema.Struct({ system: Schema.Unknown }).pipe(
  Schema.filter((o): o is { system: ISystem } => 'system' in o, {
    message: () => 'System module must export const system: System',
  }),
);

/**
 * Load the system entry (systemPath) via jiti.
 * Module must export `export const system: System`. Requires Path (provide NodePath at the edge).
 */
export const loadSystemFn = Effect.fn('loadSystemFn')(function* (
  config: ISystemConfig,
): Effect.fn.Return<
  ISystem,
  IAnyError,
  Path.Path | FileSystem.FileSystem | Async
> {
  const { entry } = config;
  const cwd = process.cwd();
  const pathApi = yield* Path.Path;
  const systemPath = pathApi.resolve(cwd, entry);
  const jitiAliases = yield* jitiAliasesFromTsconfigPaths(cwd).pipe(
    Effect.mapError(
      cause =>
        new ZerospinError({
          code: 'jiti-import-failed',
          message: 'Failed to read tsconfig.json for jiti path aliases.',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    ),
  );
  const { href: systemFileUrl } = yield* pathApi.toFileUrl(systemPath).pipe(
    Effect.mapError(
      cause =>
        new ZerospinError({
          cause: ZerospinError.prettyUnknownFailure(cause),
          code: 'file-url-failed',
        }),
    ),
  );
  const jiti = createJiti(systemFileUrl, { alias: jitiAliases });

  const loadedModule = yield* makeAsync(
    () => jiti.import(systemPath),
    ZerospinError.catch({
      code: 'jiti-import-failed',
      preferCauseMessage: false,
    }),
  );

  const { system } = yield* Schema.validate(ModuleSchema)(loadedModule, {
    onExcessProperty: 'ignore',
  }).pipe(
    Effect.mapError(
      cause =>
        new ZerospinError({
          code: 'validate-unknown-failed',
          message: `Failed to validate system module: ${cause.message}`,
        }),
    ),
  );
  return system;
});
