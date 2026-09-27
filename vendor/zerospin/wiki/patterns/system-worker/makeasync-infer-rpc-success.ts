import { Effect } from 'effect';

/**
 * Let `makeAsync` infer the RPC success shape from the promise-returning queue method.
 *
 * @bad Force a wire-envelope generic onto `makeAsync`.
 * @bad Keep RPC result imports only to annotate `makeAsync`.
 */
export const readNextCommands = Effect.fn('Repo.readNextCommands')(
  function* (props: {
    queue: {
      getPage(props: { afterIndex: number }): PromiseLike<unknown>;
    };
    afterAggregateIndex: number | null;
  }) {
    return yield* makeAsync(() =>
      props.queue.getPage({
        afterIndex: props.afterAggregateIndex ?? 0,
      }),
    ).pipe(Effect.flatMap(decodeRpc));
  },
);

declare function makeAsync<A>(
  fn: () => PromiseLike<A>,
): Effect.Effect<A, unknown, unknown>;
declare function decodeRpc<A>(encoded: A): Effect.Effect<A, unknown, unknown>;
