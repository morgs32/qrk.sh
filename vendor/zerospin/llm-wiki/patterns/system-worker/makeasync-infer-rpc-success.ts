import { Effect } from 'effect';

/**
 * Let `makeAsync` infer RPC success shapes from the promise-returning repo method.
 *
 * @bad Do not write `makeAsync<Schema.EitherEncoded<IReplayBatch, IAnyErrorJson>>(() => repo.getReplayBlocks(props))`.
 * @bad Do not keep `Schema`, `IAnyErrorJson`, or replay-shape imports only to annotate `makeAsync`.
 */
export const readNextReplayBatch = Effect.fn('Replica.readNextReplayBatch')(
  function* (props: {
    aggregateBlockRepo: {
      getReplayBlocks(props: {
        afterAggregateCursor: unknown;
        afterAggregateIndex: number | null;
      }): PromiseLike<unknown>;
    };
    afterAggregateCursor: unknown;
    afterAggregateIndex: number | null;
  }) {
    return yield* makeAsync(() =>
      props.aggregateBlockRepo.getReplayBlocks({
        afterAggregateCursor: props.afterAggregateCursor,
        afterAggregateIndex: props.afterAggregateIndex,
      }),
    ).pipe(Effect.flatMap(decodeRpc));
  },
);

declare function makeAsync<A>(
  fn: () => PromiseLike<A>,
): Effect.Effect<A, unknown, unknown>;
declare function decodeRpc<A>(encoded: A): Effect.Effect<A, unknown, unknown>;
