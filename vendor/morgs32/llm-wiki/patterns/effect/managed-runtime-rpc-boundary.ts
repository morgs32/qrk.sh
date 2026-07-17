import { Effect, Layer, ManagedRuntime } from 'effect';

declare function getWorker(props: {
  workerId: string;
}): Effect.Effect<{ getNames: () => Promise<string[]> }, unknown, never>;

const managedRuntime = ManagedRuntime.make(Layer.empty);

/**
 * RpcTarget public methods run through managedRuntime + Effect.gen.
 *
 * @bad async body that await runPromise(getWorker) outside Effect.gen.
 * @bad const workerEffect = getWorker(...); yield* workerEffect staging.
 * @bad Private #workerEffect() wrapper around a one-line getWorker call.
 */
export class GatewayApi {
  #workerId = 'w1';

  async getNames() {
    const workerId = this.#workerId;
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const worker = yield* getWorker({ workerId });
        return yield* Effect.promise(() => worker.getNames());
      }),
    );
  }
}

/**
 * @bad Expose nested Durable Object stubs across RPC bindings — flatten to serializable methods.
 */
// Good: GatewayApi.getNames resolves worker internally and returns plain data.

/**
 * Session constructors stay sync; hydration runs at the edge.
 *
 * @bad Async hydrateSession inside makeSession Effect.fn.
 */
export const makeSession = (props: { actorId: string }) => ({
  ...props,
  staged: [],
});

void Effect.runPromise(
  Effect.gen(function* () {
    const session = makeSession({ actorId: 'a1' });
    return session;
  }),
);

declare namespace Effect {
  function runPromise<A>(effect: Effect.Effect<A, unknown, never>): Promise<A>;
}
