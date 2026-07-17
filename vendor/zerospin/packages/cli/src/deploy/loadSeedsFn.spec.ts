import { FileSystem, Path } from '@effect/platform';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import { loadSeedsFn } from './loadSeedsFn.js';

const platformLayer = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  AsyncLive,
);

describe('loadSeedsFn', () => {
  it.layer(platformLayer)(it => {
    it.effect('returns empty array when seeds path is null', () =>
      Effect.gen(function* () {
        const seeds = yield* loadSeedsFn({
          entry: 'src/system.ts',
          environmentId: 'dev',
          env: null,
          seeds: null,
        });

        expect(seeds).toEqual([]);
      }),
    );

    it.effect('imports seeds module and runs export const seeds Effect', () =>
      Effect.scoped(
        Effect.gen(function* () {
          const pathApi = yield* Path.Path;
          const fileSystem = yield* FileSystem.FileSystem;
          const cwd = yield* fileSystem.makeTempDirectoryScoped({
            prefix: 'load-seeds-test-',
          });
          yield* fileSystem.writeFileString(
            pathApi.join(cwd, 'seeds-module.ts'),
            `import { Effect } from 'effect';

export const seeds = Effect.succeed([{ id: 'cmd_from_effect' }]);
`,
          );

          const seeds = yield* loadSeedsFn(
            {
              entry: 'src/system.ts',
              environmentId: 'dev',
              env: null,
              seeds: 'seeds-module.ts',
            },
            cwd,
          );

          expect(seeds).toEqual([{ id: 'cmd_from_effect' }]);
        }),
      ),
    );

    it.effect('imports service command seeds', () =>
      Effect.scoped(
        Effect.gen(function* () {
          const pathApi = yield* Path.Path;
          const fileSystem = yield* FileSystem.FileSystem;
          const cwd = yield* fileSystem.makeTempDirectoryScoped({
            prefix: 'load-service-seeds-test-',
          });
          yield* fileSystem.writeFileString(
            pathApi.join(cwd, 'seeds-module.ts'),
            `import { Effect } from 'effect';

export const seeds = Effect.succeed([
  {
    id: 'cmd_service_seed',
    commandName: 'createProduct',
    payload: { id: 'prd_seed' },
    version: '1.0.0',
    systemVersion: '1.0.0',
    commandType: 'service',
    serviceName: 'app',
  },
]);
`,
          );

          const seeds = yield* loadSeedsFn(
            {
              entry: 'src/system.ts',
              environmentId: 'dev',
              env: null,
              seeds: 'seeds-module.ts',
            },
            cwd,
          );

          expect(seeds).toEqual([
            {
              id: 'cmd_service_seed',
              commandName: 'createProduct',
              payload: { id: 'prd_seed' },
              version: '1.0.0',
              systemVersion: '1.0.0',
              commandType: 'service',
              serviceName: 'app',
            },
          ]);
        }),
      ),
    );
  });
});
