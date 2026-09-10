import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ISystemConfig } from '@zerospin/core/system/types';
import { ZerospinConfigSchema } from '@zerospin/core/system/ZerospinConfigSchema';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, FileSystem, Path, Schema } from 'effect';
import { createJiti } from 'jiti';

import { jitiAliasesFromTsconfigPaths } from './jitiAliasesFromTsconfigPaths.js';

/** Import the exact root configuration without running a typechecker or seeds. */
export const loadZerospinConfigFn: (
  cwd?: string,
) => Effect.Effect<
  ISystemConfig,
  IAnyError,
  Async | FileSystem.FileSystem | Path.Path
> = Effect.fn('loadZerospinConfigFn')(
  function* (
    cwd: string = process.cwd(),
  ): Effect.fn.Return<
    ISystemConfig,
    IAnyError,
    Async | FileSystem.FileSystem | Path.Path
  > {
    const pathApi = yield* Path.Path;
    const fileSystem = yield* FileSystem.FileSystem;
    const configPath = pathApi.resolve(cwd, 'zerospin.config.ts');
    const config = yield* Effect.gen(function* () {
      // An explicit existence check prevents jiti from trying other extensions.
      if (!(yield* fileSystem.exists(configPath))) {
        return yield* new ZerospinError({
          code: 'deploy-invalid-config',
          message: `Missing project configuration: ${configPath}.`,
        });
      }
      const alias = yield* jitiAliasesFromTsconfigPaths(cwd);
      const loadedModule = yield* makeAsync(() =>
        createJiti(configPath, {
          alias,
          moduleCache: false,
          tryNative: false,
        }).import(configPath),
      );
      return yield* Schema.decodeUnknownEffect(
        Schema.Struct({ default: ZerospinConfigSchema }),
      )(loadedModule, { onExcessProperty: 'ignore' });
    }).pipe(
      Effect.mapError(
        cause =>
          new ZerospinError({
            code: 'deploy-invalid-config',
            message: `Failed to load ${configPath}.`,
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
      ),
    );
    return config.default;
  },
);
