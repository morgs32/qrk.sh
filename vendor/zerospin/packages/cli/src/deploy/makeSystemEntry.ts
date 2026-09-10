import { ZerospinError } from '@zerospin/error';
import { Effect, FileSystem, Path } from 'effect';

/** Keep the Worker system adapter alive for the caller's process scope. */
export const makeSystemEntry = Effect.fn('makeSystemEntry')(function* (
  cwd: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathApi = yield* Path.Path;
  return yield* Effect.gen(function* () {
    const directory = yield* fileSystem.makeTempDirectoryScoped({
      directory: cwd,
      prefix: '.zerospin-entry-',
    });
    const entryPath = pathApi.join(directory, 'system.ts');
    const configPath = pathApi.resolve(cwd, 'zerospin.config.ts');
    yield* fileSystem.writeFileString(
      entryPath,
      `import configuration from ${JSON.stringify(configPath)};\nexport const config = configuration;\nexport const system = config.system;\n`,
      { mode: 0o600 },
    );
    return entryPath;
  }).pipe(
    Effect.mapError(
      cause =>
        new ZerospinError({
          code: 'system-entry-write-failed',
          message: `Failed to prepare the Worker system entry for ${cwd}.`,
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    ),
  );
});
