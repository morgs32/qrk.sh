import { Effect } from 'effect';

/**
 * Fanout owns subscriber progress; the coordinator owns retry and the alarm.
 * A callback returns `false` only when that subscriber exhausted its attempts.
 *
 * @bad Run all subscribers without a concurrency bound.
 * @bad Stop unrelated subscribers when one target exhausts its attempts.
 * @bad Advance a subscriber watermark before its target RPC succeeds.
 */
export const drainSubscriberFanout = Effect.fn(
  'BlockRepo.drainSubscriberFanout',
)(function* (props: {
  fanoutQueue: {
    drain(): Effect.Effect<void, Error>;
  };
}) {
  yield* props.fanoutQueue.drain();
});

export const processSubscriber = Effect.fn('BlockRepo.processSubscriber')(
  function* (props: {
    retry<A>(delivery: Effect.Effect<A, Error>): Effect.Effect<A, Error>;
    subscriber: {
      id: string;
      currentIndex: number;
    };
    targetRepo: {
      handle(blocks: readonly unknown[]): PromiseLike<unknown>;
    };
    readNextBlocks(afterIndex: number): readonly unknown[];
    acknowledge(props: { id: string; currentIndex: number }): void;
    recordDiagnostic(props: { id: string; failure: string }): void;
  }) {
    const blocks = props.readNextBlocks(props.subscriber.currentIndex);
    if (blocks.length === 0) {
      return true;
    }
    const delivered = yield* props
      .retry(
        makeAsync(() => props.targetRepo.handle(blocks)).pipe(
          Effect.flatMap(decodeRpc),
        ),
      )
      .pipe(Effect.either);
    if (delivered._tag === 'Left') {
      props.recordDiagnostic({
        id: props.subscriber.id,
        failure: delivered.left.message,
      });
      return false;
    }
    props.acknowledge({
      id: props.subscriber.id,
      currentIndex: props.subscriber.currentIndex + blocks.length,
    });
    return true;
  },
);

declare function makeAsync<A>(
  fn: () => PromiseLike<A>,
): Effect.Effect<A, Error>;
declare function decodeRpc<A>(encoded: A): Effect.Effect<A, Error>;
