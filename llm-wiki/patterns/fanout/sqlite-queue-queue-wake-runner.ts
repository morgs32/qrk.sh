import { Effect } from 'effect';

/**
 * SQLite is the fanout queue; Cloudflare Queue is only the wake runner.
 *
 * @bad Call `retry` per subscriber after every `publish` when auto-delivery already enqueued work.
 * @bad Run infinite `Effect.forever(Queue.take(...))` tied to request lifetime.
 */
export const publishFinalizationEventFanout = Effect.fn(
  'publishFinalizationEventFanout',
)(function* (props: {
  fanout: {
    publish: (p: { payload: unknown }) => Promise<unknown>;
    retry: (p: { id: string }) => Promise<unknown>;
  };
  batch: unknown;
}) {
  yield* makeAsync(() => props.fanout.publish({ payload: props.batch })).pipe(
    Effect.flatMap(decodeRpc),
  );
});

export const awaitFanoutCatchUpInTest = Effect.fn('awaitFanoutCatchUpInTest')(
  function* (props: {
    fanout: { retry: (p: { id: string }) => Promise<unknown> };
    subscriberId: string;
  }) {
    yield* makeAsync(() => props.fanout.retry({ id: props.subscriberId })).pipe(
      Effect.flatMap(decodeRpc),
    );
  },
);

declare function makeAsync<A>(
  fn: () => Promise<A>,
): Effect.Effect<A, unknown, unknown>;
declare function decodeRpc<A>(
  effect: Effect.Effect<A, unknown, unknown>,
): Effect.Effect<A, unknown, unknown>;
declare function makeSubscriberId(name: string): string;
