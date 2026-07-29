import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

/*
 * 1. Canonicalize every object key recursively while preserving array order.
 * 2. Encode the canonical JSON as UTF-8.
 * 3. Return one lowercase SHA-256 hex digest for cache and worker validation.
 */
export const makeFrontendSpecHash = Effect.fn('makeFrontendSpecHash')(
  function* (frontendSpec: unknown): Effect.fn.Return<string, IAnyError> {
    const canonicalize = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        const canonicalItems: unknown[] = [];
        for (const item of value) {
          canonicalItems.push(canonicalize(item));
        }
        return canonicalItems;
      }

      if (value !== null && typeof value === 'object') {
        const canonicalRecord: Record<string, unknown> = {};
        for (const key of Object.keys(value).toSorted()) {
          canonicalRecord[key] = canonicalize(Reflect.get(value, key));
        }
        return canonicalRecord;
      }

      return value;
    };

    const canonicalJson = JSON.stringify(canonicalize(frontendSpec));
    if (canonicalJson === undefined) {
      return yield* new ZerospinError({
        code: 'frontend-spec-canonicalization-failed',
        message: 'Frontend specification is not JSON-encodable',
      });
    }

    const digest = yield* Effect.tryPromise({
      try: () =>
        globalThis.crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(canonicalJson),
        ),
      catch: ZerospinError.catch({
        code: 'frontend-spec-hash-failed',
        message: 'Failed to hash the canonical frontend specification',
      }),
    });

    let hash = '';
    for (const byte of new Uint8Array(digest)) {
      hash += byte.toString(16).padStart(2, '0');
    }
    return hash;
  },
);
