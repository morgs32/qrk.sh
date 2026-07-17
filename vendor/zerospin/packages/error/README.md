# @zerospin/error

Zerospin Error provides a type-safe, structured error system for Effect-based applications. It extends Effect's `Data.TaggedError` to provide consistent error handling with serialization support, error codes, and optional metadata.

## Installation

```bash
npm install @zerospin/error effect
```

## Basic Usage

### Creating Errors

`ZerospinError` can be created in two ways:

**Simple form (code only):**

```typescript
import { ZerospinError } from '@zerospin/error';

const error = new ZerospinError('my-error-code');
// Creates an error with code: 'my-error-code', message: 'my-error-code'
```

**Full form (with metadata):**

```typescript
import { ZerospinError } from '@zerospin/error';

const error = new ZerospinError({
  code: 'failed-to-fetch',
  message: 'Failed to fetch data from server',
  cause: ZerospinError.prettyUnknownFailure(originalError),
  extra: { url: 'https://api.example.com' },
  status: 500,
});
```

`cause` is **`null | string`** (diagnostic text for logs/RPC). Format unknown failures with **`ZerospinError.prettyUnknownFailure`** before assigning.

## Using ZerospinError in Effect Contexts

### 1. Throwing Errors in Effect.gen

In `Effect.gen` functions, use `yield*` to throw errors:

```typescript
import { Effect } from 'effect';
import { ZerospinError } from '@zerospin/error';

const fetchData = Effect.fn('fnName')(function* () {
  const res = yield* Effect.tryPromise(() => fetch('/api/data'));

  if (res.status === 404) {
    return yield* new ZerospinError({
      code: 'resource-not-found',
      message: 'Resource not found',
    });
  }

  return yield* res.json();
});
```

**Example from Zerospin:**

```typescript
// From packages/client/src/ZerospinClientAdapter.ts
export const ZerospinClientAdapter = Layer.effect(
  ZerospinStorageAdapter,
  Effect.fn('getClientAdapter')(function* () {
    const isOPFSSupported = yield* OPFSAdapter.check().pipe(
      Effect.either,
      Effect.map(either => Either.isRight(either)),
    );
    if (isOPFSSupported) {
      return OPFSAdapter;
    }
    const isLocalStorageSupported = yield* LocalStorageAdapter.check().pipe(
      Effect.either,
      Effect.map(either => Either.isRight(either)),
    );
    if (isLocalStorageSupported) {
      return LocalStorageAdapter;
    }
    return yield* new ZerospinError({
      code: 'no-adapter-available',
      message: 'No adapter available',
    });
  })(),
);
```

### 2. Mapping Errors with Effect.mapError

Transform errors from other Effect operations:

```typescript
import { Effect } from 'effect';
import { ZerospinError } from '@zerospin/error';

const parseJson = Effect.tryPromise(() => res.json()).pipe(
  Effect.mapError(error => {
    return new ZerospinError({
      code: 'failed-to-parse-json',
      message: 'Failed to parse JSON',
      cause: ZerospinError.prettyUnknownFailure(error),
    });
  }),
);
```

**Example from Zerospin:**

```typescript
// From packages/client/src/makeZerospinFetchFrontendApi.ts
Effect.fn('fnName')(function* () {
  const res = yield* Effect.tryPromise(async () => {
    return fetch(url, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }).catch((error: unknown) => {
      throw new ZerospinError({
        code: 'failed-to-fetch',
        message: 'Failed to fetch',
        cause: ZerospinError.prettyUnknownFailure(error),
      });
    });
  }).pipe(
    Effect.mapError(error => {
      return new ZerospinError({
        code: 'failed-to-fetch',
        message: 'Failed to fetch',
        cause: ZerospinError.prettyUnknownFailure(error),
      });
    }),
  );
});
```

### 3. Catching All Errors with Effect.catchAll

Handle any error and convert it to a ZerospinError:

```typescript
import { Effect } from 'effect';
import { ZerospinError } from '@zerospin/error';

const safeOperation = someEffect.pipe(
  Effect.catchAll(error => {
    return new ZerospinError({
      code: 'operation-failed',
      message: error.message,
      cause: ZerospinError.prettyUnknownFailure(error),
    });
  }),
);
```

**Example from Zerospin:**

```typescript
// From packages/zerospin/src/batch/makeSafe.ts
Effect.fn('fnName')(function* () {
  const safe = yield* Schema.validate(schema)(command, {
    onExcessProperty: 'preserve',
  }).pipe(
    Effect.mapError(error => {
      return new ZerospinError({
        code: 'failed-to-validate-command',
        message: error.message,
        cause: ZerospinError.prettyUnknownFailure(error),
      });
    }),
  );
});
```

### 4. Handling Promise Errors

When working with promises, catch errors and throw ZerospinError:

```typescript
import { Effect } from 'effect';
import { ZerospinError } from '@zerospin/error';

const fetchData = Effect.tryPromise(async () => {
  try {
    const response = await fetch('/api/data');
    return response.json();
  } catch (error) {
    throw new ZerospinError({
      code: 'fetch-failed',
      message: 'Failed to fetch data',
      cause: ZerospinError.prettyUnknownFailure(error),
    });
  }
});
```

**Example from Zerospin:**

```typescript
// From packages/client/src/makeZerospinFetchFrontendApi.ts
Effect.fn('fnName')(function* () {
  const res = yield* Effect.tryPromise(async () => {
    return fetch(url, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }).catch((error: unknown) => {
      throw new ZerospinError({
        code: 'failed-to-fetch',
        message: 'Failed to fetch',
        cause: ZerospinError.prettyUnknownFailure(error),
      });
    });
  });
});
```

### 5. Schema Validation Errors

Convert schema validation errors to ZerospinError:

```typescript
import { Effect, Schema } from 'effect';
import { ZerospinError } from '@zerospin/error';

const validateData = Schema.decode(Schema.String)(value).pipe(
  Effect.mapError(error => {
    return new ZerospinError({
      code: 'validation-failed',
      message: error.message,
      cause: ZerospinError.prettyUnknownFailure(error),
    });
  }),
);
```

**Example from Zerospin:**

```typescript
// Encoding an unknown value with a typed Effect Schema
Effect.fn('fnName')(function* () {
  const encoded = yield* Schema.encodeUnknown(schema)(value).pipe(
    Effect.mapError(error => {
      return new ZerospinError({
        code: 'failed-to-encode-unknown',
        message: error.message,
        cause: ZerospinError.prettyUnknownFailure(error),
      });
    }),
  );
});
```

**Another example:**

```typescript
// Validating a known-shape value against a results schema
return Schema.validate(resultsSchema)(results, {
  onExcessProperty: 'error',
}).pipe(
  Effect.mapError(error => {
    return new ZerospinError({
      code: 'failed-to-validate-results',
      message: error.message,
      cause: ZerospinError.prettyUnknownFailure(error),
    });
  }),
);
```

### 6. Deserializing Errors from JSON

When receiving errors from APIs or serialized sources:

```typescript
import { ZerospinError } from '@zerospin/error';

// From packages/client/src/makeZerospinFetchFrontendApi.ts
Effect.fn('fnName')(function* () {
  const payload = yield* Effect.tryPromise(() => {
    return res.json() as Promise<IAnyErrorJson | IJson>;
  });

  if (res.status === 200) {
    return payload as IJson;
  }

  // Deserialize error from JSON
  return yield* new ZerospinError(payload as IAnyErrorJson);
});
```

### 7. Error Handling in Route Handlers

Handle errors at the boundary and serialize for HTTP responses:

```typescript
import { Effect, Exit, Cause } from 'effect';
import { ZerospinError } from '@zerospin/error';
import { NextResponse } from 'next/server';

const exit = await Effect.runPromiseExit(myEffect);

return Exit.match(exit, {
  onFailure: cause => {
    console.error(Cause.pretty(cause));
    if (Cause.isFailType(cause)) {
      const error = cause.error as ZerospinError;
      return NextResponse.json(error.serialize(), {
        status: error.status ?? 400,
      });
    }
    return NextResponse.json(
      new ZerospinError({
        code: 'unexpected-error',
        message: Cause.pretty(cause),
      }).serialize(),
      { status: 500 },
    );
  },
  onSuccess: value => {
    return NextResponse.json(value);
  },
});
```

**Example from Zerospin:**

```typescript
// From packages/zerospin/src/rpc/makeNextRoute.ts
return Exit.match(exit, {
  onFailure: cause => {
    console.error(Cause.pretty(cause));
    if (Cause.isFailType(cause)) {
      const error = cause.error as ZerospinError;
      return NextResponse.json(error.serialize(), {
        status: error.status ?? 400,
      });
    }
    return NextResponse.json(
      new ZerospinError({
        code: 'unexpected-error',
        message: Cause.pretty(cause),
      }).serialize(),
      { status: 500 },
    );
  },
  onSuccess: value => {
    return NextResponse.json(value);
  },
});
```

## Error Properties

### Error Structure

```typescript
interface IError<T extends string = string, E = unknown> {
  code: T; // Error code identifier
  status: null | number; // HTTP status code (optional)
  cause?: unknown; // Original error that caused this
  extra?: E; // Additional typed metadata
  message?: string; // Human-readable message
}
```

### Type Safety with Error Codes

You can create type-safe error codes:

```typescript
type MyErrorCodes =
  | 'failed-to-fetch'
  | 'validation-failed'
  | 'resource-not-found';

const error: ZerospinError<MyErrorCodes> = new ZerospinError({
  code: 'failed-to-fetch', // TypeScript will validate this
  message: 'Failed to fetch',
});
```

## Utility Methods

### Checking if Something is a ZerospinError

```typescript
import { ZerospinError } from '@zerospin/error';

if (ZerospinError.isZerospinError(error)) {
  console.log(error.code);
  console.log(error.message);
}
```

**Example from Zerospin:**

```typescript
// From packages/zerospin/src/ZerospinErrorLayer.ts
Exit.mapError(exit, error => {
  if (ZerospinError.isZerospinError(error)) {
    if (error.cause) {
      error.message += ` ${error.cause}`;
    }
    if (error.extra) {
      error.message += ` ${JSON.stringify(error.extra, null, 2)}`;
    }
  }
  return error;
});
```

### Serializing Errors

Serialize errors for transmission over networks or storage:

```typescript
const error = new ZerospinError({
  code: 'my-error',
  message: 'Something went wrong',
  extra: { actorId: '123' },
  status: 400,
});

// Serialize full error
const json = error.serialize();

// Serialize without certain fields
const jsonWithoutExtra = error.serialize(['extra']);
```

## Best Practices

1. **Always provide meaningful error codes**: Use descriptive, kebab-case codes like `'failed-to-fetch'` instead of generic ones.

2. **Preserve original errors**: Use the `cause` property to maintain error chains:

   ```typescript
   new ZerospinError({
     code: 'operation-failed',
     message: 'Operation failed',
     cause: ZerospinError.prettyUnknownFailure(originalError), // Preserve the original error
   });
   ```

3. **Use typed extra data**: Leverage TypeScript generics for type-safe metadata:

   ```typescript
   new ZerospinError<ErrorCode, { actorId: string; action: string }>({
     code: 'permission-denied',
     extra: { actorId: '123', action: 'delete' },
   });
   ```

4. **Handle at boundaries**: Convert to ZerospinError at Effect boundaries (promises, HTTP handlers, etc.) and let them propagate through your Effect pipeline.

5. **Serialize for APIs**: Use `serialize()` when sending errors over HTTP or storing them.

## API Reference

### ZerospinError Class

```typescript
class ZerospinError<T extends string = never, E = unknown>
  extends Data.TaggedError('ZerospinError')<IError<T, E>>
```

**Constructor:**

- `new ZerospinError(code: string)` - Simple form
- `new ZerospinError(props: { code: T, ... })` - Full form

**Static Methods:**

- `ZerospinError.isZerospinError(data: unknown): data is ZerospinError` - Type guard
- `ZerospinError.makeZerospinErrorJson(props): IAnyErrorJson` - Create JSON representation

**Instance Methods:**

- `serialize(omit?: string[]): IAnyErrorJson` - Serialize to JSON

### Types

```typescript
type IAnyError = ZerospinError<string>;
type IAnyErrorJson = Brand.Brand<'ZerospinErrorJson'> & {
  code: string;
  extra: unknown;
  message: string;
  status: null | number;
};
```
