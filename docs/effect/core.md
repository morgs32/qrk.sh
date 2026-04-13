# Effect Core

## Find Effect code quickly

Look for:

- `Effect`
- `Effect.gen`
- `Effect.fn`
- `Layer`
- `ManagedRuntime`
- `Context.Tag`
- `Schedule`, `Stream`, `Fiber`, `Ref`, `Queue`

## Use `@effect/platform`, not `node:*`

In Effect code, prefer `FileSystem` and `Path` from `@effect/platform`.

Provide Node implementations at the edge:

```ts
import { FileSystem, Path } from '@effect/platform';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Effect, Layer } from 'effect';

const nodeLayers = Layer.merge(NodeFileSystem.layer, NodePath.layer);

export const myEffect = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathApi = yield* Path.Path;
    const path = pathApi.join('store', 'local');
    return yield* fs.exists(path);
  }).pipe(Effect.provide(nodeLayers));
```

## Prefer `Effect.fn` for named procedures

When a reusable procedure has a name, prefer `Effect.fn('name')(function* (...) { ... })`.

If the generator has no real `yield`, add `yield* Effect.void` or convert it to a plain function if the generator shape is not needed.

### Good vs bad: `Effect.fn` generators must yield

ESLint treats a generator with only `return` as invalid (`require-yield` / “This generator function does not have `yield`”). Pure synchronous bodies still need a no-op yield so the file stays lint-clean and the procedure stays a named `Effect.fn`.

**Bad** — only `return`, no `yield`:

```ts
Effect.fn('loadConfig')(function* (props: Props) {
  const config = buildConfig(props);
  return config;
});
```

**Good** — add `yield* Effect.void` when there is no other `yield` in the generator:

```ts
Effect.fn('loadConfig')(function* (props: Props) {
  yield* Effect.void;
  const config = buildConfig(props);
  return config;
});
```

## Export the `Effect.fn`, not a factory

Do not create `makeFoo(system)` wrappers around `Effect.fn`.

Keep the named `Effect.fn` exported directly and pass the receiver or system through the props object.

## Managed runtimes

Build the runtime once with `ManagedRuntime.make(layer)`.

Do not re-merge and re-provide the same layer on every `runPromise` call.

```ts
export const managedRuntime = ManagedRuntime.make(
  Layer.mergeAll(ServiceALive, ServiceBLive),
);
```

## Running effects

At the React or CLI edge, call the effect and run it there.

The effect itself should already provide its required layers when that is the established repo pattern.

## Testing effects

When testing effect-returning functions, use `@effect/vitest`.

```ts
import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';

it.live('returns empty list when store/local does not exist', () =>
  Effect.gen(function* () {
    const result = yield* getExistingLocalSlugsEffect();
    expect(result).toEqual({ existingLocalSlugs: [] });
  }),
);
```

Rules:

- use `it.effect` for pure/test-context-driven Effects
- use `it.live` when the test uses real I/O
- use `Effect.promise(() => asyncCall())` for async APIs in tests
- use `DateTime.now`, not `new Date()`
- use `tsafe` for compile-time type assertions in specs when type behavior matters
