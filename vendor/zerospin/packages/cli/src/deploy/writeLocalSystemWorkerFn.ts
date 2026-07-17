import { FileSystem, Path } from '@effect/platform';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

type IWriteLocalSystemWorkerResult = {
  compiledLength: number;
  outputPath: string;
};

export const writeLocalSystemWorkerFn = Effect.fn('writeLocalSystemWorkerFn')(
  function* (props: {
    compiledSystemWorker: string;
    outputPath: string | null;
  }) {
    const { compiledSystemWorker, outputPath } = props;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cwd = process.cwd();
    const resolvedOutputPath = outputPath
      ? path.resolve(cwd, outputPath)
      : path.join(cwd, 'dist', 'index.js');
    const outputDirectory = path.dirname(resolvedOutputPath);

    yield* fileSystem.makeDirectory(outputDirectory, { recursive: true });
    yield* fileSystem.writeFileString(resolvedOutputPath, compiledSystemWorker);

    return {
      compiledLength: compiledSystemWorker.length,
      outputPath: resolvedOutputPath,
    } satisfies IWriteLocalSystemWorkerResult;
  },
  program => {
    return program.pipe(
      Effect.mapError(
        cause =>
          new ZerospinError({
            cause: ZerospinError.prettyUnknownFailure(cause),
            code: 'deploy-local-write-failed',
            message: 'Failed to write compiled worker to a local file',
          }),
      ),
    );
  },
);
