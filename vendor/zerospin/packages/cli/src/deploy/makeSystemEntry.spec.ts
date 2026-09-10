import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import { it } from '@effect/vitest';
import { ZerospinConfigSchema } from '@zerospin/core/system/ZerospinConfigSchema';
import { Deferred, Effect, Fiber, FileSystem, Path, Schema } from 'effect';
import { createJiti } from 'jiti';
import { describe, expect } from 'vitest';

import { makeSystemEntry } from './makeSystemEntry.js';

const configRoot = new URL('../../test/config/', import.meta.url).pathname;

describe('Worker system entry lifetime', () => {
  it.layer(NodeFileSystem.layer)(it => {
    it.effect(
      'imports the config system and removes the entry after success',
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const entry = yield* Effect.scoped(
            Effect.gen(function* () {
              const entry = yield* makeSystemEntry(configRoot);
              const loaded = yield* Effect.tryPromise(() =>
                createJiti(entry, {
                  tryNative: false,
                  moduleCache: false,
                }).import(entry),
              );
              expect(loaded).toHaveProperty(
                'system.name',
                'typed-config-fixture',
              );
              const entryExports = Schema.decodeUnknownSync(
                Schema.Struct({
                  config: ZerospinConfigSchema,
                  system: Schema.Unknown,
                }),
              )(loaded);
              expect(entryExports.config.system).toBe(entryExports.system);
              expect(
                entryExports.config.system.aggregates.user?.['2.0.0']?.version,
              ).toBe('2.0.0');
              return entry;
            }),
          );
          expect(yield* fs.exists(entry)).toBe(false);
        }).pipe(Effect.provide(NodePath.layer)),
    );

    it.effect('removes the entry when the child fails', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const entry = yield* Effect.scoped(
          Effect.gen(function* () {
            const entry = yield* makeSystemEntry(configRoot);
            return yield* Effect.fail(entry);
          }),
        ).pipe(Effect.flip);
        expect(yield* fs.exists(entry)).toBe(false);
      }).pipe(Effect.provide(NodePath.layer)),
    );

    it.effect('keeps the entry alive until an interrupted child stops', () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const created = yield* Deferred.make<string>();
          const child = yield* Effect.scoped(
            Effect.gen(function* () {
              const entry = yield* makeSystemEntry(configRoot);
              yield* Deferred.succeed(created, entry);
              yield* Effect.never;
            }),
          ).pipe(Effect.forkChild);
          const entry = yield* Deferred.await(created);
          expect(yield* fs.exists(entry)).toBe(true);
          yield* Fiber.interrupt(child);
          expect(yield* fs.exists(path.dirname(entry))).toBe(false);
        }),
      ).pipe(Effect.provide(NodePath.layer)),
    );
  });
});
