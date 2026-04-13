# Errors, promises, and `Either`

## Promises that represent success-or-failure as `Either`

Some APIs resolve a `Promise` with an **`Either`** (or an encoded either) instead of rejecting. Domain failures are **left** values, not promise rejections.

Prefer `Effect.promise` plus decoding or narrowing, then **`yield* either`** inside `Effect.gen` when the success type is an `Either` (`Either` is yieldable there: left becomes `fail`, right becomes `success`). Do not wrap these calls in `Effect.tryPromise` unless you are specifically handling transport-level rejection.

`decodeResultEither` below is a **stand-in** for whatever turns the raw payload into `Either<DomainError, Success>`.

```ts
import { Effect } from 'effect';

await Effect.runPromise(
  Effect.gen(function* () {
    const either = yield* Effect.promise(() => fetchResult({ id })).pipe(Effect.map(decodeResultEither));
    return yield* either;
  }),
);
```

Do not use `Either.getOrThrow` in Effect-driven code paths; keep failures on the error channel or handle them explicitly.

## Map promise and platform errors explicitly

Translate unknown failures into structured domain errors with `Effect.mapError` (or `Effect.catchTag` when you use tagged errors).

```ts
const parsed = Effect.promise(() => res.json()).pipe(
  Effect.mapError(error => ({
    _tag: 'HttpError' as const,
    code: 'failed-to-parse-json',
    message: 'Failed to parse JSON',
    cause: error,
  })),
);
```

`Effect.catchAll` is fine when you are intentionally translating one domain error into another.

## Structured domain failures

Use a small, consistent shape so logs and HTTP responses stay predictable:

- **`code`**: stable, machine-oriented (for example kebab-case)
- **`message`**: human-readable
- **`cause`**: preserve the original error when one exists
- **`extra`**: optional structured metadata (ids, URLs, etc.)
- **`status`**: optional; only when the error maps to an HTTP status

Example (plain object on the error channel):

```ts
Effect.fail({
  _tag: 'DomainError' as const,
  code: 'resource-not-found',
  message: 'Resource not found',
  cause: undefined,
});
```

Use whatever constructor or tagged-error helper your app standardizes on; the fields above are the convention.

## Multi-step async handles

When an API returns a new async-capable handle per step, **do not** chain multiple awaits through one expression if each hop is its own async boundary. Resolve the intermediate handle, then call the next method.

Bad:

```ts
const spec = await client.openSection(id).loadSpec();
```

Good:

```ts
const section = client.openSection(id);
const spec = await section.loadSpec();
```

Names are illustrative; the rule is **one await per async boundary** when intermediates are themselves async.
