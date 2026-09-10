import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner';
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect, FileSystem, Layer } from 'effect';
import { expect, it } from 'vitest';

import { e2eFn } from './e2eFn.js';

it('runs the shared configuration fixture through the generated Worker entry', async () => {
  const fixtureRoot = new URL('../../test/config/', import.meta.url).pathname;
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const cwd = yield* fs.makeTempDirectoryScoped({
          directory: new URL('../../test/', import.meta.url).pathname,
          prefix: '.typed-config-e2e-',
        });
        for (const file of [
          'zerospin.config.ts',
          'Worker.ts',
          'config.workerd.spec.ts',
          'vitest.zerospin.config.ts',
          'wrangler.jsonc',
        ]) {
          yield* fs.writeFileString(
            `${cwd}/${file}`,
            yield* fs.readFileString(`${fixtureRoot}${file}`),
          );
        }
        const result = yield* e2eFn(cwd);
        expect(result.vitestConfigPath).toBe(
          `${cwd}/vitest.zerospin.config.ts`,
        );
        const after = yield* fs.readDirectory(cwd);
        expect(
          after.filter(name => name.startsWith('.zerospin-entry-')),
        ).toEqual([]);
      }),
    ).pipe(
      Effect.provide([
        AsyncLive,
        NodeChildProcessSpawner.layer.pipe(
          Layer.provideMerge(
            Layer.mergeAll(NodeFileSystem.layer, NodePath.layer),
          ),
        ),
      ]),
    ),
  );
}, 90_000);
