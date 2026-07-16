import { Effect } from 'effect';

declare class DomainError extends Error {
  constructor(props: { code: string; cause?: unknown });
}

declare function encodeRpc(effect: unknown): Promise<unknown>;

type IRpcEitherEncoded<T> = Promise<
  { _tag: 'Right'; right: T } | { _tag: 'Left'; left: unknown }
>;

/**
 * Internal runners return plain `Effect`; encode once on the public RPC method.
 *
 * @bad `Queue.start(): IRpcEitherEncoded<void>` with `encodeRpc` inside the runner.
 * @bad Propagating wire encoding through every layer before the stub boundary.
 */
class Queue {
  start() {
    return Effect.tryPromise({
      try: async () => {
        // drain queue
      },
      catch: cause => new DomainError({ code: 'queue-failed', cause }),
    });
  }
}

class QueueRepo {
  start(): IRpcEitherEncoded<void> {
    return Effect.runPromise(
      this.queue.start().pipe(encodeRpc),
    ) as IRpcEitherEncoded<void>;
  }

  constructor(private readonly queue: Queue) {}
}

export { Queue, QueueRepo };
