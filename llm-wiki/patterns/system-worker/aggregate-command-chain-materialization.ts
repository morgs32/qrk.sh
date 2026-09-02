import { Effect } from 'effect';

/**
 * Let the command chain own ordered admission and retained terminal history; let the materialized Repo execute one occurrence and return its command-local delta.
 *
 * @bad Execute authored code in the history owner.
 * @bad Admit more than one aggregate occurrence at one `aggregateIndex`.
 * @bad Publish subscriber output before the terminal occurrence is retained.
 */
export const dispatchHead = Effect.fn('AggregateCommandChain.dispatchHead')(
  function* (props: {
    command: unknown;
    materializedAggregateRepo: {
      execute(props: { command: unknown }): PromiseLike<unknown>;
    };
    retainTerminal(command: unknown): Effect.Effect<void>;
    notifySubscribers(): Effect.Effect<void>;
  }) {
    const terminal = yield* Effect.promise(() =>
      props.materializedAggregateRepo.execute({ command: props.command }),
    );

    yield* props.retainTerminal(terminal);
    yield* props.notifySubscribers();
    return terminal;
  },
);
