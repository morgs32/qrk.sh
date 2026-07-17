import { FileSystem, Path } from '@effect/platform';
import * as NodePath from '@effect/platform-node/NodePath';
import { it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import { jitiAliasesFromTsconfigPaths } from './jitiAliasesFromTsconfigPaths.js';

const cwd = '/project';

const tsconfigPath = `${cwd}/tsconfig.json`;

const fileSystemLayer = (files: Record<string, string>) =>
  FileSystem.layerNoop({
    exists: path => Effect.succeed(path in files),
    readFileString: path =>
      path in files
        ? Effect.succeed(files[path]!)
        : Effect.die(`unexpected read: ${path}`),
  });

const layerForFiles = (files: Record<string, string>) =>
  Layer.mergeAll(fileSystemLayer(files), NodePath.layer);

describe('jitiAliasesFromTsconfigPaths', () => {
  it.layer(layerForFiles({}))(it => {
    it.effect('returns {} when tsconfig.json is missing', () =>
      Effect.gen(function* () {
        const alias = yield* jitiAliasesFromTsconfigPaths(cwd);
        expect(alias).toEqual({});
      }),
    );
  });

  it.layer(
    layerForFiles({
      [tsconfigPath]: JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@zerospin/core/*': ['../packages/core/src/*'],
          },
        },
      }),
    }),
  )(it => {
    it.effect('maps compilerOptions.paths to jiti alias roots', () =>
      Effect.gen(function* () {
        const pathApi = yield* Path.Path;
        const alias = yield* jitiAliasesFromTsconfigPaths(cwd);

        expect(alias).toEqual({
          '@zerospin/core': pathApi.resolve(cwd, '../packages/core/src'),
        });
      }),
    );
  });

  it.layer(
    layerForFiles({
      [tsconfigPath]: 'not json',
    }),
  )(it => {
    it.effect('returns {} when tsconfig.json is invalid JSON', () =>
      Effect.gen(function* () {
        const alias = yield* jitiAliasesFromTsconfigPaths(cwd);
        expect(alias).toEqual({});
      }),
    );
  });

  it.layer(
    layerForFiles({
      [tsconfigPath]: JSON.stringify({ compilerOptions: {} }),
    }),
  )(it => {
    it.effect('returns {} when compilerOptions.paths is absent', () =>
      Effect.gen(function* () {
        const alias = yield* jitiAliasesFromTsconfigPaths(cwd);
        expect(alias).toEqual({});
      }),
    );
  });
});
