import { FileSystem, Path } from '@effect/platform';
import { Effect } from 'effect';

interface ITsconfigJson {
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
}

/**
 * Map `compilerOptions.paths` entries like `"@zerospin/core/*": ["../packages/core/src/*"]` into jiti `alias` roots (unjs/jiti does not read tsconfig paths).
 * Returns `{}` when there is no usable tsconfig/paths or nothing maps to jiti aliases.
 * Requires {@link Path} and {@link FileSystem} (e.g. `NodePath.layer` + `NodeFileSystem.layer`).
 */
export const jitiAliasesFromTsconfigPaths = Effect.fn(
  'jitiAliasesFromTsconfigPaths',
)(function* (cwd: string) {
  const pathApi = yield* Path.Path;
  const fileSystem = yield* FileSystem.FileSystem;

  const tsconfigPath = pathApi.join(cwd, 'tsconfig.json');

  const hasConfig = yield* fileSystem.exists(tsconfigPath);
  if (!hasConfig) {
    return {};
  }

  const contents = yield* fileSystem.readFileString(tsconfigPath);

  const parsed = yield* Effect.try(
    () => JSON.parse(contents) as ITsconfigJson,
  ).pipe(
    Effect.catchAll(() =>
      Effect.succeed(undefined as ITsconfigJson | undefined),
    ),
  );

  const paths = parsed?.compilerOptions?.paths;
  if (!paths || typeof paths !== 'object') {
    return {};
  }

  const tsconfigDir = pathApi.dirname(tsconfigPath);
  const pathsBase =
    parsed.compilerOptions?.baseUrl !== undefined
      ? pathApi.resolve(tsconfigDir, parsed.compilerOptions.baseUrl)
      : tsconfigDir;

  const alias: Record<string, string> = {};

  for (const [pattern, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets) || targets.length === 0) continue;
    const targetPattern = targets[0];
    if (typeof targetPattern !== 'string') continue;
    const starSuffix = '/*';
    if (!pattern.endsWith(starSuffix)) continue;

    /** jiti prefix key: `@/*` → `@`, `@zerospin/core/*` → `@zerospin/core` */
    const aliasKey = pattern.slice(0, -starSuffix.length);
    if (aliasKey.length === 0 || !targetPattern.endsWith(starSuffix)) {
      continue;
    }

    const targetDir = targetPattern.slice(0, -starSuffix.length);
    alias[aliasKey] = pathApi.resolve(pathsBase, targetDir);
  }

  return alias;
});
