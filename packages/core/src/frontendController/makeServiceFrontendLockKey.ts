import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { ServiceFrontendLockSchema } from './makeServiceFrontendLock.ts';

export const makeServiceFrontendLockKey = Effect.fn(
  'makeServiceFrontendLockKey',
)(function* (
  lock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>,
): Effect.fn.Return<string, IAnyError> {
  const encoded = yield* Schema.encode(ServiceFrontendLockSchema)(lock, {
    onExcessProperty: 'error',
  }).pipe(
    mapParseError({
      code: 'service-frontend-lock-encode-failed',
      prefix: 'Failed to encode the service frontend lock',
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
      code: 'service-frontend-lock-key-failed',
      message: 'Failed to hash the service frontend lock',
    }),
  });

  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
});
