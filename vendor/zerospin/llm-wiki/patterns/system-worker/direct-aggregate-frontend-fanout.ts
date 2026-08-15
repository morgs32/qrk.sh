import { Effect } from 'effect';

/**
 * An AggregateFrontendRepo admitted before freeze pulls archived batches to their advertised terminal cursor, then subscribes for later blocks.
 *
 * @bad Bootstrap the projection from an AggregateRepo resource snapshot.
 * @bad Treat initial history catch-up as subscriber delivery or synchronously drain the fanout queue from a state request.
 * @bad Compare against a separately captured moving replay bound after catch-up.
 * @bad Rebuild a target absent from frozen projection bounds solely to return unusable read-only state.
 */
export const catchupAndSubscribe = Effect.fn(
  'AggregateFrontendRepo.catchupAndSubscribe',
)(function* (props: {
  archive: {
    getReplayBlocks(props: {
      afterAggregateCursor: unknown;
      afterAggregateIndex: number | null;
    }): Effect.Effect<{
      blocks: readonly {
        lastAggregateCursor: unknown;
        aggregateIndex: number;
      }[];
      lastAvailableAggregateCursor: unknown;
    }>;
    subscribeAggregateFrontend(props: {
      currentAggregateCursor: unknown;
      currentAggregateIndex: number | null;
    }): Effect.Effect<void>;
  };
  projection: {
    applyAggregateBlocks(
      blocks: readonly {
        lastAggregateCursor: unknown;
        aggregateIndex: number;
      }[],
    ): Effect.Effect<void>;
  };
  currentAggregateCursor: unknown;
  currentAggregateIndex: number | null;
}) {
  let currentAggregateCursor = props.currentAggregateCursor;
  let currentAggregateIndex = props.currentAggregateIndex;

  while (true) {
    const batch = yield* props.archive.getReplayBlocks({
      afterAggregateCursor: currentAggregateCursor,
      afterAggregateIndex: currentAggregateIndex,
    });
    const lastBlock = batch.blocks[batch.blocks.length - 1];
    if (lastBlock === undefined) {
      if (batch.lastAvailableAggregateCursor !== currentAggregateCursor) {
        return yield* Effect.fail(
          new Error('Archive ended before its advertised terminal cursor'),
        );
      }
      break;
    }

    yield* props.projection.applyAggregateBlocks(batch.blocks);
    currentAggregateCursor = lastBlock.lastAggregateCursor;
    currentAggregateIndex = lastBlock.aggregateIndex;
    if (currentAggregateCursor === batch.lastAvailableAggregateCursor) {
      break;
    }
  }

  yield* props.archive.subscribeAggregateFrontend({
    currentAggregateCursor,
    currentAggregateIndex,
  });
});

/**
 * AggregateBlockRepo directly delivers only post-subscription blocks to the exact AggregateFrontendRepo target.
 *
 * @bad Insert ActorRepo or ActorBlockRepo between the aggregate archive and AggregateFrontendRepo.
 * @bad Reconstruct a frontend repo name from partial identity during delivery.
 * @bad Advance the subscriber watermark before `handleAggregateBlocks` succeeds.
 */
export const processSubscriber = Effect.fn(
  'AggregateBlockRepo.processSubscriber',
)(function* (props: {
  blocks: readonly unknown[];
  subscriber: {
    aggregateFrontendRepoName: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
}) {
  const aggregateFrontendRepo = env.AGGREGATE_FRONTEND_REPO.getByName(
    props.subscriber.aggregateFrontendRepoName,
  );

  yield* Effect.promise(() =>
    aggregateFrontendRepo.handleAggregateBlocks({
      blocks: props.blocks,
    }),
  );

  yield* advanceSubscriberWatermark({
    aggregateFrontendRepoName: props.subscriber.aggregateFrontendRepoName,
    blocks: props.blocks,
  });
});

declare const env: {
  AGGREGATE_FRONTEND_REPO: {
    getByName(name: string): {
      handleAggregateBlocks(props: {
        blocks: readonly unknown[];
      }): Promise<unknown>;
    };
  };
};
declare function advanceSubscriberWatermark(props: {
  aggregateFrontendRepoName: string;
  blocks: readonly unknown[];
}): Effect.Effect<void>;
