# Effect Schemas

Use `Schema` from `effect` (this repo also depends on `@effect/schema`; follow whichever import path the module already uses).

## Keep schema and domain types in parity

Define the domain type first, then define the schema and assert parity.

```ts
import type { Equals } from 'tsafe';

import { Schema } from 'effect';
import { assert } from 'tsafe';

export interface IFoo {
  bar: string;
}

export const ZFoo = Schema.Struct({
  bar: Schema.String,
}) satisfies Schema.Schema<IFoo, any>;

const _check1: typeof ZFoo.Type = {} as IFoo;
const _check2: IFoo = {} as typeof ZFoo.Type;
void _check1;
void _check2;
assert<Equals<typeof ZFoo.Type, Readonly<IFoo>>>();
```

If `assert<Equals<...>>` does not line up cleanly but `satisfies` is correct, the `_check1` / `_check2` pattern is acceptable.

## Decode unknown input

When validating unknown input, use `Schema.decodeUnknown`, `Schema.decodeUnknownEither`, or `Schema.decodeUnknownSync` as the situation requires (Effect pipeline vs sync vs `Either`).

Always pass **`onExcessProperty`** (for example `'ignore'` at JSON boundaries, `'error'` when you want strict shapes).

Effect-backed decode:

```ts
import { Effect, Schema } from 'effect';

const program = Schema.decodeUnknown(MySchema)(raw, {
  onExcessProperty: 'ignore',
});
// program: Effect.Effect<...>
```

## Sync decoding in React / Next.js

In server components or other synchronous decode points, use `Schema.decodeUnknownSync(...)`.

```ts
const { page, q } = Schema.decodeUnknownSync(MySchema)(raw, {
  onExcessProperty: 'ignore',
});
```

Do not wrap simple sync decode in `Effect.runPromise(...)`.

## React server components: `Either` success inside an `Effect`

When a server component (or route handler) runs an `Effect` whose **success** value is an `Either`, assign the result of `yield*` to a variable and then **`yield*` that `Either` again**. In `Effect.gen`, `Either` is yieldable: `Left` becomes `Effect.fail`, `Right` becomes `Effect.succeed`, so failures stay on the Effect error channel for `runPromise`.

Do not use `Either.getOrThrowWith` / ad‑hoc helpers that throw from inside `Effect.map`.

Below, `doRemoteCall` is a **stand-in** for any `Effect` that succeeds with an `Either` (domain error on the left, success on the right).

Bad (redundant `Either.match`):

```ts
import { Effect, Either } from 'effect';

await Effect.runPromise(
  Effect.gen(function* () {
    const either = yield* doRemoteCall(props);
    return yield* Either.match(either, {
      onLeft: error => Effect.fail(error),
      onRight: value => Effect.succeed(value),
    });
  }),
);
```

Good:

```ts
import { Effect } from 'effect';

await Effect.runPromise(
  Effect.gen(function* () {
    const either = yield* doRemoteCall(props);
    return yield* either;
  }),
);
```

## Decode unknown inside `Effect.gen`

When you need Effect composition or error-channel handling, use `Schema.decodeUnknown` and map parse errors into your domain error type.

```ts
import { Effect, Schema } from 'effect';

Effect.gen(function* () {
  const decoded = yield* Schema.decodeUnknown(MySchema)(unknownValue, {
    onExcessProperty: 'error',
  }).pipe(
    Effect.mapError(parseError => ({
      _tag: 'DecodeError' as const,
      code: 'failed-to-decode-unknown',
      message: 'Schema decode failed',
      cause: parseError,
    })),
  );
  return decoded;
});
```

Adjust the mapped shape to match the error channel you use elsewhere (`Effect.fail`, `Data.TaggedError`, etc.).
