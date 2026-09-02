import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect, FileSystem, Layer, Path } from 'effect';
import { describe, expect } from 'vitest';

import { loadZerospinConfigFn } from './loadZerospinConfigFn.js';

const platformLayer = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  AsyncLive,
);

describe('loadZerospinConfigFn', () => {
  it.layer(platformLayer)(it => {
    it.effect('loads JSONC and normalizes omitted production seeds', () =>
      Effect.scoped(
        Effect.gen(function* () {
          const pathApi = yield* Path.Path;
          const fileSystem = yield* FileSystem.FileSystem;
          const cwd = yield* fileSystem.makeTempDirectoryScoped({
            prefix: 'zerospin-jsonc-config-test-',
          });
          yield* fileSystem.writeFileString(
            pathApi.join(cwd, 'zerospin.jsonc'),
            `{
  // Editor metadata is accepted but not returned to CLI consumers.
  "$schema": "./node_modules/@zerospin/sdk/zerospin.schema.json",
  "entry": "src/system.ts",
  "seeds": {
    "dev": "src/seeds.ts",
  },
}\n`,
          );

          const config = yield* loadZerospinConfigFn(cwd);

          expect(config).toEqual({
            entry: 'src/system.ts',
            seeds: { dev: 'src/seeds.ts', production: null },
          });
          expect(config).not.toHaveProperty('$schema');
        }),
      ),
    );

    for (const production of ['src/production-seeds.ts', null]) {
      it.effect(
        `accepts an explicit ${String(production)} production seed`,
        () =>
          Effect.scoped(
            Effect.gen(function* () {
              const pathApi = yield* Path.Path;
              const fileSystem = yield* FileSystem.FileSystem;
              const cwd = yield* fileSystem.makeTempDirectoryScoped({
                prefix: 'zerospin-jsonc-production-seed-test-',
              });
              yield* fileSystem.writeFileString(
                pathApi.join(cwd, 'zerospin.jsonc'),
                `${JSON.stringify({
                  entry: 'src/system.ts',
                  seeds: { dev: null, production },
                })}\n`,
              );

              const config = yield* loadZerospinConfigFn(cwd);

              expect(config.seeds.production).toBe(production);
            }),
          ),
      );
    }

    for (const [name, contents] of [
      ['malformed JSONC', '{'],
      [
        'an unknown top-level property',
        JSON.stringify({
          entry: 'src/system.ts',
          seeds: { dev: null },
          unknown: true,
        }),
      ],
      [
        'an unknown seeds property',
        JSON.stringify({
          entry: 'src/system.ts',
          seeds: { dev: null, unknown: true },
        }),
      ],
    ] as const) {
      it.effect(`rejects ${name}`, () =>
        Effect.scoped(
          Effect.gen(function* () {
            const pathApi = yield* Path.Path;
            const fileSystem = yield* FileSystem.FileSystem;
            const cwd = yield* fileSystem.makeTempDirectoryScoped({
              prefix: 'zerospin-jsonc-invalid-test-',
            });
            yield* fileSystem.writeFileString(
              pathApi.join(cwd, 'zerospin.jsonc'),
              contents,
            );

            const failure = yield* loadZerospinConfigFn(cwd).pipe(Effect.flip);

            expect(failure.code).toBe('deploy-invalid-config');
          }),
        ),
      );
    }

    it.effect('rejects a missing root config', () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const cwd = yield* fileSystem.makeTempDirectoryScoped({
            prefix: 'zerospin-jsonc-missing-test-',
          });

          const failure = yield* loadZerospinConfigFn(cwd).pipe(Effect.flip);

          expect(failure.code).toBe('deploy-invalid-config');
        }),
      ),
    );

    it.effect('rejects a legacy executable config', () =>
      Effect.scoped(
        Effect.gen(function* () {
          const pathApi = yield* Path.Path;
          const fileSystem = yield* FileSystem.FileSystem;
          const cwd = yield* fileSystem.makeTempDirectoryScoped({
            prefix: 'zerospin-jsonc-legacy-test-',
          });
          yield* fileSystem.writeFileString(
            pathApi.join(cwd, 'zerospin.config.ts'),
            'export default {};\n',
          );

          const failure = yield* loadZerospinConfigFn(cwd).pipe(Effect.flip);

          expect(failure.code).toBe('deploy-invalid-config');
        }),
      ),
    );

    it.effect('rejects a nested .config/zerospin.jsonc file', () =>
      Effect.scoped(
        Effect.gen(function* () {
          const pathApi = yield* Path.Path;
          const fileSystem = yield* FileSystem.FileSystem;
          const cwd = yield* fileSystem.makeTempDirectoryScoped({
            prefix: 'zerospin-jsonc-nested-test-',
          });
          const nestedConfigRoot = pathApi.join(cwd, '.config');
          yield* fileSystem.makeDirectory(nestedConfigRoot);
          yield* fileSystem.writeFileString(
            pathApi.join(nestedConfigRoot, 'zerospin.jsonc'),
            `${JSON.stringify({
              entry: 'src/system.ts',
              seeds: { dev: null },
            })}\n`,
          );

          const failure = yield* loadZerospinConfigFn(cwd).pipe(Effect.flip);

          expect(failure.code).toBe('deploy-invalid-config');
        }),
      ),
    );
  });
});
