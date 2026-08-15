import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { AggregateFrontendLockSchema } from './makeAggregateFrontendLock.ts';

export const makeAggregateFrontendLockKey = Effect.fn(
  'makeAggregateFrontendLockKey',
)(function* (
  lock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>,
): Effect.fn.Return<string, IAnyError> {
  const encoded = yield* Schema.encode(AggregateFrontendLockSchema)(lock, {
    onExcessProperty: 'error',
  }).pipe(
    mapParseError({
      code: 'aggregate-frontend-lock-encode-failed',
      prefix: 'Failed to encode the aggregate frontend lock',
    }),
  );

  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(sort);
    }
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .toSorted(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, sort(entry)]),
      );
    }
    return value;
  };

  const digest = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(sort(encoded))),
      ),
    catch: ZerospinError.catch({
      code: 'aggregate-frontend-lock-key-failed',
      message: 'Failed to hash the aggregate frontend lock',
    }),
  });

  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
});
