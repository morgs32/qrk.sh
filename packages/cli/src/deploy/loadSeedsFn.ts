import { Path, type FileSystem } from '@effect/platform';
import { type Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDeploySeedCommand } from '@zerospin/core/contracts/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { ISystemConfig } from '@zerospin/core/system/types';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { createJiti } from 'jiti';

import { jitiAliasesFromTsconfigPaths } from './jitiAliasesFromTsconfigPaths.js';

const SeedsModuleSchema = Schema.Struct({ seeds: Schema.Unknown }).pipe(
  Schema.filter(
    (
      seedsModule,
    ): seedsModule is {
      seeds: Effect.Effect<
        readonly IDeploySeedCommand[],
        IAnyError,
        CuidFactory
      >;
    } => Effect.isEffect(seedsModule.seeds),
    {
      message: () =>
        'Seeds module must export const seeds: Effect (CLI runs it at deploy; do not runSync at import)',
    },
  ),
);

/**
 * Load config.seeds path via jiti and run `export const seeds`.
 * Module must export `export const seeds: Effect<readonly IDeploySeedCommand[], ...>`.
 */
export const loadSeedsFn = Effect.fn('loadSeedsFn')(function* (
  config: ISystemConfig,
  cwd: string = process.cwd(),
): Effect.fn.Return<
  readonly IDeploySeedCommand[],
  IAnyError,
  Path.Path | FileSystem.FileSystem | Async
> {
  const { seeds: seedsEntry } = config;
  if (seedsEntry === null) {
    return [];
  }

  const pathApi = yield* Path.Path;
  const seedsPath = pathApi.resolve(cwd, seedsEntry);
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
  const { href: seedsFileUrl } = yield* pathApi.toFileUrl(seedsPath).pipe(
    Effect.mapError(
      cause =>
        new ZerospinError({
          cause: ZerospinError.prettyUnknownFailure(cause),
          code: 'file-url-failed',
        }),
    ),
  );
  const jiti = createJiti(seedsFileUrl, { alias: jitiAliases });

  const loadedModule = yield* makeAsync(
    () => jiti.import(seedsPath),
    ZerospinError.catch({
      code: 'jiti-import-failed',
      message: `Failed to import seeds module at ${seedsEntry}`,
      preferCauseMessage: false,
    }),
  );

  const { seeds } = yield* Schema.validate(SeedsModuleSchema)(loadedModule, {
    onExcessProperty: 'ignore',
  }).pipe(
    Effect.mapError(
      cause =>
        new ZerospinError({
          code: 'deploy-invalid-seeds-module',
          message: `Failed to validate seeds module: ${cause.message}`,
        }),
    ),
  );

  return yield* makeAsync(
    () =>
      ManagedRuntime.make(
        Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory, AsyncLive),
      ).runPromise(seeds),
    ZerospinError.catch({
      code: 'deploy-seeds-failed',
      message: `Failed to run seeds Effect from ${seedsEntry}`,
      preferCauseMessage: false,
    }),
  );
});
