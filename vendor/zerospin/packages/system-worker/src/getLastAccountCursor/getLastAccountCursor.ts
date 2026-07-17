/*
 * System-worker annotation:
 * Reads the repo-local last account cursor marker from Durable Object storage.
 * `undefined` means the repo has not bootstrapped; `null` means it bootstrapped
 * from an empty upstream cursor.
 */

import type { ITx } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { type IAccountCursor } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

const LAST_ACCOUNT_CURSOR_KV_KEY = 'lastAccountCursor';
const LAST_ACCOUNT_INDEX_KV_KEY = 'lastAccountIndex';

const decodeCursor = Schema.decodeUnknown(
  Schema.UndefinedOr(
    Schema.NullOr(makeAbbreviationIdSchema(coreAbbreviations.accountCursor)),
  ),
);
const decodeIndex = Schema.decodeUnknown(
  Schema.UndefinedOr(Schema.NullOr(Schema.Number)),
);

export const getLastAccountCursor = Effect.fn('getLastAccountCursor')(
  function* <DEFAULT_VALUE extends IAccountCursor | null>(props: {
    storage: DurableObjectStorage;
    defaultValue?: DEFAULT_VALUE;
  }): Effect.fn.Return<DEFAULT_VALUE, IAnyError> {
    const { defaultValue, storage } = props;
    const cursor = yield* Effect.sync(() =>
      storage.kv.get(LAST_ACCOUNT_CURSOR_KV_KEY),
    );
    const decodedCursor = yield* decodeCursor(cursor).pipe(
      Effect.mapError(
        cause =>
          new ZerospinError({
            code: 'getLastAccountCursor-invalid-lastAccountCursor',
            message: `Failed to decode last account cursor: ${cause.message}`,
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

export const setLastAccountCursor = Effect.fn('setLastAccountCursor')(
  function* (props: {
    storage: DurableObjectStorage;
    /*
     * DO KV does not use the Drizzle transaction directly. This prop keeps the
     * call site visibly tied to the transaction that advanced the cursor.
     */
    tx: ITx;
    accountCursor: IAccountCursor | null;
  }) {
    const { accountCursor, storage } = props;
    yield* Effect.sync(() =>
      storage.kv.put(LAST_ACCOUNT_CURSOR_KV_KEY, accountCursor),
    );
  },
);

export const getLastAccountIndex = Effect.fn('getLastAccountIndex')(function* <
  DEFAULT_VALUE extends number | null,
>(props: {
  storage: DurableObjectStorage;
  defaultValue?: DEFAULT_VALUE;
}): Effect.fn.Return<DEFAULT_VALUE, IAnyError> {
  const { defaultValue, storage } = props;
  const index = yield* Effect.sync(() =>
    storage.kv.get(LAST_ACCOUNT_INDEX_KV_KEY),
  );
  const decodedIndex = yield* decodeIndex(index).pipe(
    Effect.mapError(
      cause =>
        new ZerospinError({
          code: 'getLastAccountIndex-invalid-lastAccountIndex',
          message: `Failed to decode last account index: ${cause.message}`,
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    ),
  );

  if ('defaultValue' in props && decodedIndex === undefined) {
    return defaultValue as DEFAULT_VALUE;
  }

  return decodedIndex as DEFAULT_VALUE;
});

export const setLastAccountIndex = Effect.fn('setLastAccountIndex')(
  function* (props: {
    storage: DurableObjectStorage;
    /*
     * DO KV does not use the Drizzle transaction directly. This prop keeps the
     * call site visibly tied to the transaction that advanced the index.
     */
    tx: ITx;
    accountIndex: number | null;
  }) {
    const { accountIndex, storage } = props;
    yield* Effect.sync(() =>
      storage.kv.put(LAST_ACCOUNT_INDEX_KV_KEY, accountIndex),
    );
  },
);
