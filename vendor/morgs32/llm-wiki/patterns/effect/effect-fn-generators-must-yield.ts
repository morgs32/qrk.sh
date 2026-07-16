import { Effect } from 'effect';

/**
 * Effect.fn generators must yield — add yield* Effect.void for sync-only bodies.
 *
 * @bad Generator with only `return` and no yield (require-yield lint failure).
 * @bad eslint-disable require-yield instead of yield* Effect.void.
 */
export const makeDurableAdapter = Effect.fn('makeDurableAdapter')(
  function* (props: { storage: unknown; schema: unknown }) {
    yield* Effect.void;
    const db = { storage: props.storage, schema: props.schema };
    return { db };
  },
);
