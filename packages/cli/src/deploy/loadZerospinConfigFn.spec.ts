import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { Effect, FileSystem, Path } from 'effect';
import { describe, expect } from 'vitest';

import { loadZerospinConfigFn } from './loadZerospinConfigFn.js';

const configRoot = new URL('../../test/config/', import.meta.url).pathname;

describe('typed project configuration', () => {
  it.layer(NodeFileSystem.layer)(it => {
    it.effect('imports the authored system capability', () =>
      Effect.gen(function* () {
        const config = yield* loadZerospinConfigFn(configRoot);
        expect(config.system.name).toBe('typed-config-fixture');
        expect(
          config.system.config({ systemId: 'sys_typed_config_fixture' }).system,
        ).toBe(config.system);
        expect(
          makeSystemSpec({
            system: config.system.config({
              systemId: 'sys_typed_config_fixture',
            }).system,
          }),
        ).toEqual(makeSystemSpec({ system: config.system }));
      }).pipe(Effect.provide([NodePath.layer, AsyncLive])),
    );

    for (const [name, contents] of [
      ['missing file', null],
      ['missing default export', 'export const config = {};'],
      ['invalid system', 'export default { system: {} };'],
      [
        'missing system ID',
        `import config from ${JSON.stringify(`${configRoot}zerospin.config.ts`)}; export default { system: config.system };`,
      ],
      [
        'invalid system ID',
        `import config from ${JSON.stringify(`${configRoot}zerospin.config.ts`)}; export default { ...config, systemId: 'shopping' };`,
      ],
      ['failed import', 'throw new Error("fixture-import-broke");'],
    ]) {
      it.effect(`reports ${name} with the exact configuration path`, () =>
        Effect.scoped(
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const cwd = yield* fs.makeTempDirectoryScoped();
            const configPath = path.join(cwd, 'zerospin.config.ts');
            if (contents !== null && contents !== undefined) {
              yield* fs.writeFileString(configPath, contents);
            }
            const failure = yield* loadZerospinConfigFn(cwd).pipe(Effect.flip);
            expect(failure.code).toBe('deploy-invalid-config');
            expect(failure.message).toContain(configPath);
            if (name === 'failed import') {
              expect(failure.cause).toContain('fixture-import-broke');
            }
          }),
        ).pipe(Effect.provide([NodePath.layer, AsyncLive])),
      );
    }
  });
});
