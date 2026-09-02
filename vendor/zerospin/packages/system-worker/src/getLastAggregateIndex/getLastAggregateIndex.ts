/*
 * System-worker annotation:
 * Reads and writes the Repo-local last aggregate index marker from Durable
 * Object storage.
 */

import type { ITx } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

const LAST_AGGREGATE_INDEX_KV_KEY = 'lastAggregateIndex';

const decodeIndex = Schema.decodeUnknownEffect(
  Schema.UndefinedOr(Schema.NullOr(Schema.Number)),
);

export const getLastAggregateIndex = Effect.fn('getLastAggregateIndex')(
  function* <DEFAULT extends number | null>(props: {
    storage: DurableObjectStorage;
    defaultValue: DEFAULT;
  }): Effect.fn.Return<number | DEFAULT, IAnyError> {
    const { defaultValue, storage } = props;
    const index = yield* Effect.sync(() =>
      storage.kv.get(LAST_AGGREGATE_INDEX_KV_KEY),
    );
    const decodedIndex = yield* decodeIndex(index).pipe(
      Effect.mapError(
        cause =>
          new ZerospinError({
            code: 'getLastAggregateIndex-invalid-lastAggregateIndex',
            message: `Failed to decode last aggregate index: ${cause.message}`,
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
      ),
    );

    return decodedIndex ?? defaultValue;
  },
);

export const setLastAggregateIndex = Effect.fn('setLastAggregateIndex')(
  function* (props: {
    storage: DurableObjectStorage;
    /*
     * DO KV does not use the Drizzle transaction directly. This prop keeps the
     * call site visibly tied to the transaction that advanced the index.
     */
    tx: ITx;
    aggregateIndex: number | null;
  }) {
    const { aggregateIndex, storage } = props;
    yield* Effect.sync(() =>
      storage.kv.put(LAST_AGGREGATE_INDEX_KV_KEY, aggregateIndex),
    );
  },
);
