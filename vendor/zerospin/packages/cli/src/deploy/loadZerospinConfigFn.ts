import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { type ISystemConfig } from '@zerospin/core/system/types';
import { ZerospinConfigSchema } from '@zerospin/core/system/ZerospinConfigSchema';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { loadConfig } from 'c12';
import { Effect, FileSystem, Path, Schema } from 'effect';

/**
 * Load and validate the project's root zerospin.jsonc file.
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
    const configPath = pathApi.join(cwd, 'zerospin.jsonc');

    const result = yield* makeAsync(() =>
      loadConfig<Record<string, unknown>>({
        cwd,
        name: 'zerospin',
        configFile: configPath,
        configFileRequired: true,
        dotenv: false,
        envName: false,
        rcFile: false,
        giget: false,
        extend: false,
        packageJson: false,
      }),
    ).pipe(
      Effect.mapError(
        cause =>
          new ZerospinError({
            code: 'deploy-invalid-config',
            message: `Failed to load ${configPath}.`,
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
      ),
    );

    return yield* Schema.decodeUnknownEffect(ZerospinConfigSchema)(
      result.config,
      {
        onExcessProperty: 'error',
      },
    ).pipe(
      Effect.mapError(
        cause =>
          new ZerospinError({
            code: 'deploy-invalid-config',
            message: `Failed to decode ${configPath}: ${cause.message}`,
          }),
      ),
    );
  },
);
