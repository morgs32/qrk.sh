import { Effect } from 'effect';

/**
 * MaterializedAggregateFrontendRepo executes one pushed command and atomically retains its optimistic journals and aggregate-forwarding outbox.
 *
 * @bad Split optimistic state and aggregate forwarding across different owners.
 * @bad Admit several frontend commands under one `pushIndex`.
 * @bad Rebuild a smaller aggregate command that loses flat push provenance.
 */
export const execute = Effect.fn('MaterializedAggregateFrontendRepo.execute')(
  function* (props: {
    command: unknown;
    transaction(
      program: (tx: unknown) => Effect.Effect<unknown>,
    ): Effect.Effect<unknown>;
    applyOptimism(command: unknown, tx: unknown): Effect.Effect<unknown>;
    insertAggregateOutbox(command: unknown, tx: unknown): Effect.Effect<void>;
  }) {
    return yield* props.transaction(
      Effect.fn('MaterializedAggregateFrontendRepo.execute.transaction')(
        function* (tx) {
          const terminal = yield* props.applyOptimism(props.command, tx);
          yield* props.insertAggregateOutbox(terminal, tx);
          return terminal;
        },
      ),
    );
  },
);
