import { Effect } from 'effect';

/**
 * Let `makeAsync` infer the RPC success shape from the promise-returning chain method.
 *
 * @bad Force a wire-envelope generic onto `makeAsync`.
 * @bad Keep RPC result imports only to annotate `makeAsync`.
 */
export const readNextCommands = Effect.fn('MaterializedRepo.readNextCommands')(
  function* (props: {
    chain: {
      getCommands(props: {
        afterAggregateIndex: number | null;
      }): PromiseLike<unknown>;
    };
    afterAggregateIndex: number | null;
  }) {
    return yield* makeAsync(() =>
      props.chain.getCommands({
        afterAggregateIndex: props.afterAggregateIndex,
      }),
    ).pipe(Effect.flatMap(decodeRpc));
  },
);

declare function makeAsync<A>(
  fn: () => PromiseLike<A>,
): Effect.Effect<A, unknown, unknown>;
declare function decodeRpc<A>(encoded: A): Effect.Effect<A, unknown, unknown>;
