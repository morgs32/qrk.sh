import { Effect } from 'effect';

/**
 * Export the Effect.fn directly — no one-off alias on the next line.
 *
 * @bad `const executeSelectQueryImpl = Effect.fn(...)(...); export const executeSelectQuery = executeSelectQueryImpl`.
 */
export const executeSelectQuery = Effect.fn('executeSelectQuery')(
  function* (props: { query: unknown }) {
    return props.query;
  },
);

/**
 * Inline single-use helpers called once with no policy.
 *
 * @bad Sibling Effect.fn file with exactly one consumer — inline into the owning method.
 */
export const finalizeBatch = Effect.fn('OrderRepo.finalizeBatch')(
  function* (props: { commands: readonly unknown[] }) {
    return props.commands.length;
  },
);
