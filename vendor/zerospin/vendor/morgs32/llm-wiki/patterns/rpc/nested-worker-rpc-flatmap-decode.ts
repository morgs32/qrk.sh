import { Effect } from 'effect';

declare function decodeRpc<T>(encoded: unknown): Effect.Effect<T, unknown>;

declare const systemWorker: {
  getActorId(props: {
    accountName: string;
    actorName: string;
  }): Promise<unknown>;
};

declare class ActorApiFailure {
  constructor(error: unknown);
}

/**
 * Nested worker RPC inside a factory uses `flatMap(decodeRpc)` so wire Left reaches outer `catchAll`.
 *
 * @bad `Effect.map(decodeRpc)` then `Effect.map(Either.getOrThrowWith(...))` — throw is a defect, outer catchAll never runs.
 */
export const buildActorApi = Effect.fn('buildActorApi')(function* () {
  const actorId = yield* Effect.promise(() =>
    systemWorker.getActorId({ accountName: 'orders', actorName: 'customer' }),
  ).pipe(Effect.flatMap(decodeRpc));

  return { actorId };
}).pipe(Effect.catchAll(error => Effect.succeed(new ActorApiFailure(error))));
