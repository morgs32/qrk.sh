/*
 * System-worker annotation:
 * Reads the repo-local last aggregate cursor marker from Durable Object storage.
 * `undefined` means the repo has not bootstrapped; `null` means it bootstrapped
 * from an empty upstream cursor.
 */

import type { ITx } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IAggregateCursor } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

const LAST_AGGREGATE_CURSOR_KV_KEY = 'lastAggregateCursor';
const LAST_AGGREGATE_INDEX_KV_KEY = 'lastAggregateIndex';

const decodeCursor = Schema.decodeUnknown(
  Schema.UndefinedOr(
    Schema.NullOr(makeAbbreviationIdSchema(coreAbbreviations.aggregateCursor)),
  ),
);
const decodeIndex = Schema.decodeUnknown(
  Schema.UndefinedOr(Schema.NullOr(Schema.Number)),
);

export const getLastAggregateCursor = Effect.fn('getLastAggregateCursor')(
  function* <DEFAULT_VALUE extends IAggregateCursor | null>(props: {
    storage: DurableObjectStorage;
    defaultValue?: DEFAULT_VALUE;
  }): Effect.fn.Return<DEFAULT_VALUE, IAnyError> {
    const { defaultValue, storage } = props;
    const cursor = yield* Effect.sync(() =>
      storage.kv.get(LAST_AGGREGATE_CURSOR_KV_KEY),
    );
    const decodedCursor = yield* decodeCursor(cursor).pipe(
      Effect.mapError(
        cause =>
          new ZerospinError({
            code: 'getLastAggregateCursor-invalid-lastAggregateCursor',
            message: `Failed to decode last aggregate cursor: ${cause.message}`,
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
      ),
    );

    if ('defaultValue' in props && decodedCursor === undefined) {
      return defaultValue as DEFAULT_VALUE;
    }

    return decodedCursor as DEFAULT_VALUE;
  },
);

export const setLastAggregateCursor = Effect.fn('setLastAggregateCursor')(
  function* (props: {
    storage: DurableObjectStorage;
    /*
     * DO KV does not use the Drizzle transaction directly. This prop keeps the
     * call site visibly tied to the transaction that advanced the cursor.
     */
    tx: ITx;
    aggregateCursor: IAggregateCursor | null;
  }) {
    const { aggregateCursor, storage } = props;
    yield* Effect.sync(() =>
      storage.kv.put(LAST_AGGREGATE_CURSOR_KV_KEY, aggregateCursor),
    );
  },
);

export const getLastAggregateIndex = Effect.fn('getLastAggregateIndex')(
  function* <DEFAULT_VALUE extends number | null>(props: {
    storage: DurableObjectStorage;
    defaultValue?: DEFAULT_VALUE;
  }): Effect.fn.Return<DEFAULT_VALUE, IAnyError> {
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

    if ('defaultValue' in props && decodedIndex === undefined) {
      return defaultValue as DEFAULT_VALUE;
    }

    return decodedIndex as DEFAULT_VALUE;
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
