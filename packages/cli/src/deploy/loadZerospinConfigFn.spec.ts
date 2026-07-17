import { FileSystem, Path } from '@effect/platform';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { ZerospinConfigSchema } from '@zerospin/core/system/ZerospinConfigSchema';
import { Effect, Layer, Schema } from 'effect';
import { describe, expect, vi } from 'vitest';

import { loadZerospinConfigFn } from './loadZerospinConfigFn.js';

const platformLayer = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  AsyncLive,
);

describe('loadZerospinConfigFn', () => {
  it.layer(platformLayer)(it => {
    it.effect(
      'loads config with a seeds path without importing the seeds module',
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const pathApi = yield* Path.Path;
            const fileSystem = yield* FileSystem.FileSystem;
            const cwd = yield* fileSystem.makeTempDirectoryScoped({
              prefix: 'zerospin-config-test-',
            });
            yield* fileSystem.writeFileString(
              pathApi.join(cwd, 'zerospin.config.ts'),
              `export default {
  entry: 'src/system.ts',
  environmentId: 'dev',
  env: null,
  seeds: 'src/zerospin/seeds.ts',
};
`,
            );

            const config = yield* loadZerospinConfigFn(cwd);

            expect(config.entry).toBe('src/system.ts');
            expect(config.seeds).toBe('src/zerospin/seeds.ts');
          }),
        ),
    );

    it.effect(
      'loads a TypeScript config in a package without a type without emitting the typeless package warning',
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const pathApi = yield* Path.Path;
            const fileSystem = yield* FileSystem.FileSystem;
            const cwd = yield* fileSystem.makeTempDirectoryScoped({
              prefix: 'zerospin-config-typeless-package-test-',
            });
            yield* fileSystem.writeFileString(
              pathApi.join(cwd, 'package.json'),
              `{
  "name": "zerospin-config-typeless-package-test"
}
`,
            );
            yield* fileSystem.writeFileString(
              pathApi.join(cwd, 'zerospin.config.ts'),
              `export default {
  entry: 'src/system.ts',
  environmentId: 'dev',
  env: null,
  seeds: null,
};
`,
            );

            const warningListener = vi.fn();
            process.on('warning', warningListener);
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => process.off('warning', warningListener)),
            );

            const config = yield* loadZerospinConfigFn(cwd);
            yield* Effect.promise(
              () => new Promise<void>(resolve => setTimeout(resolve, 0)),
            );

            expect(config.entry).toBe('src/system.ts');
            expect(warningListener).not.toHaveBeenCalledWith(
              expect.objectContaining({
                code: 'MODULE_TYPELESS_PACKAGE_JSON',
              }),
            );
          }),
        ),
    );

    it.effect('loads a .js config', () =>
      Effect.scoped(
        Effect.gen(function* () {
          const pathApi = yield* Path.Path;
          const fileSystem = yield* FileSystem.FileSystem;
          const cwd = yield* fileSystem.makeTempDirectoryScoped({
            prefix: 'zerospin-config-js-test-',
          });
          yield* fileSystem.writeFileString(
            pathApi.join(cwd, 'zerospin.config.js'),
            `export default {
  entry: 'src/system.js',
  environmentId: 'dev',
  env: null,
  seeds: null,
};
`,
          );

          const config = yield* loadZerospinConfigFn(cwd);

          expect(config.entry).toBe('src/system.js');
        }),
      ),
    );

    it.effect('loads a .ts config', () =>
      Effect.scoped(
        Effect.gen(function* () {
          const pathApi = yield* Path.Path;
          const fileSystem = yield* FileSystem.FileSystem;
          const cwd = yield* fileSystem.makeTempDirectoryScoped({
            prefix: 'zerospin-config-ts-test-',
          });
          yield* fileSystem.writeFileString(
            pathApi.join(cwd, 'zerospin.config.ts'),
            `export default {
  entry: 'src/system.ts',
  environmentId: 'dev',
  env: null,
  seeds: null,
};
`,
          );

          const config = yield* loadZerospinConfigFn(cwd);

          expect(config.entry).toBe('src/system.ts');
        }),
      ),
    );

    it.effect('loads a .mjs config', () =>
      Effect.scoped(
        Effect.gen(function* () {
          const pathApi = yield* Path.Path;
          const fileSystem = yield* FileSystem.FileSystem;
          const cwd = yield* fileSystem.makeTempDirectoryScoped({
            prefix: 'zerospin-config-mjs-test-',
          });
          yield* fileSystem.writeFileString(
            pathApi.join(cwd, 'zerospin.config.mjs'),
            `export default {
  entry: 'src/system.mjs',
  environmentId: 'dev',
  env: null,
  seeds: null,
};
`,
          );

          const config = yield* loadZerospinConfigFn(cwd);

          expect(config.entry).toBe('src/system.mjs');
        }),
      ),
    );

    it.effect('loads a .cjs config', () =>
      Effect.scoped(
        Effect.gen(function* () {
          const pathApi = yield* Path.Path;
          const fileSystem = yield* FileSystem.FileSystem;
          const cwd = yield* fileSystem.makeTempDirectoryScoped({
            prefix: 'zerospin-config-cjs-test-',
          });
          yield* fileSystem.writeFileString(
            pathApi.join(cwd, 'zerospin.config.cjs'),
            `module.exports = {
  entry: 'src/system.cjs',
  environmentId: 'dev',
  env: null,
  seeds: null,
};
`,
          );

          const config = yield* loadZerospinConfigFn(cwd);

          expect(config.entry).toBe('src/system.cjs');
        }),
      ),
    );

    it.effect('loads a .mts config', () =>
      Effect.scoped(
        Effect.gen(function* () {
          const pathApi = yield* Path.Path;
          const fileSystem = yield* FileSystem.FileSystem;
          const cwd = yield* fileSystem.makeTempDirectoryScoped({
            prefix: 'zerospin-config-mts-test-',
          });
          yield* fileSystem.writeFileString(
            pathApi.join(cwd, 'zerospin.config.mts'),
            `export default {
  entry: 'src/system.mts',
  environmentId: 'dev',
  env: null,
  seeds: null,
};
`,
          );

          const config = yield* loadZerospinConfigFn(cwd);

          expect(config.entry).toBe('src/system.mts');
        }),
      ),
    );

    it.effect('loads a .cts config', () =>
      Effect.scoped(
        Effect.gen(function* () {
          const pathApi = yield* Path.Path;
          const fileSystem = yield* FileSystem.FileSystem;
          const cwd = yield* fileSystem.makeTempDirectoryScoped({
            prefix: 'zerospin-config-cts-test-',
          });
          yield* fileSystem.writeFileString(
            pathApi.join(cwd, 'zerospin.config.cts'),
            `module.exports = {
  entry: 'src/system.cts',
  environmentId: 'dev',
  env: null,
  seeds: null,
};
`,
          );

          const config = yield* loadZerospinConfigFn(cwd);

          expect(config.entry).toBe('src/system.cts');
        }),
      ),
    );
  });
});

describe('ZerospinConfigSchema', () => {
  it.effect('accepts a seeds entry path string', () =>
    Effect.gen(function* () {
      const config = yield* Schema.validate(ZerospinConfigSchema)(
        {
          entry: 'src/system.ts',
          environmentId: 'dev',
          env: null,
          seeds: 'src/zerospin/seeds.ts',
        },
        { onExcessProperty: 'ignore' },
      );

      expect(config.seeds).toBe('src/zerospin/seeds.ts');
    }),
  );

  it.effect('accepts null seeds', () =>
    Effect.gen(function* () {
      const config = yield* Schema.validate(ZerospinConfigSchema)(
        {
          entry: 'src/system.ts',
          environmentId: 'dev',
          env: null,
          seeds: null,
        },
        { onExcessProperty: 'ignore' },
      );

      expect(config.seeds).toBeNull();
    }),
  );
});
