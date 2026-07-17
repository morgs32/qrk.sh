import { Effect } from 'effect';

/**
 * Let `makeAsync` infer RPC success shapes from the promise-returning repo method.
 *
 * @bad Do not write `makeAsync<Schema.EitherEncoded<IAccountCursor | null, IAnyErrorJson>>(() => repo.getLastAccountCursor())`.
 * @bad Do not keep `Schema`, `IAnyErrorJson`, cursor, or resource-shape imports only to annotate `makeAsync`.
 */
export const bootstrapReplica = Effect.fn('Replica.bootstrap')(
  function* (props: {
    accountRepo: {
      getLastAccountCursor(): PromiseLike<unknown>;
      dumpModelResources(props: { modelName: string }): PromiseLike<unknown>;
    };
    fanout: {
      subscribe(props: { lastAppliedCursor: unknown }): PromiseLike<unknown>;
    };
    modelName: string;
  }) {
    const lastAccountCursor = yield* makeAsync(() =>
      props.accountRepo.getLastAccountCursor(),
    ).pipe(Effect.flatMap(decodeRpc));

    const resources = yield* makeAsync(() =>
      props.accountRepo.dumpModelResources({
        modelName: props.modelName,
      }),
    ).pipe(Effect.flatMap(decodeRpc));

    yield* makeAsync(() =>
      props.fanout.subscribe({
        lastAppliedCursor,
      }),
    ).pipe(Effect.flatMap(decodeRpc));

    return { lastAccountCursor, resources };
  },
);

declare function makeAsync<A>(
  fn: () => PromiseLike<A>,
): Effect.Effect<A, unknown, unknown>;
declare function decodeRpc<A>(encoded: A): Effect.Effect<A, unknown, unknown>;
