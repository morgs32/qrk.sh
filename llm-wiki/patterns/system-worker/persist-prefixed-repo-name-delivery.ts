import { Effect } from 'effect';

/**
 * Persist the exact prefixed `aggregateFrontendRepoName` and pass it unchanged to `getByName` during delivery.
 *
 * @bad Persist only aggregate/actor/frontend coordinates and rebuild the Durable Object name during delivery.
 * @bad Store a Durable Object identity in a generic `name` column.
 * @bad Strip the repo prefix or retry an unprefixed legacy name when lookup fails.
 */
export const rememberAggregateFrontendSubscriber = Effect.fn(
  'AggregateBlockRepo.rememberAggregateFrontendSubscriber',
)(function* (props: {
  aggregateFrontendRepoName: string;
  tx: {
    insert(table: unknown): {
      values(row: { aggregateFrontendRepoName: string }): { run(): void };
    };
  };
}) {
  props.tx
    .insert(aggregateFrontendSubscribers)
    .values({ aggregateFrontendRepoName: props.aggregateFrontendRepoName })
    .run();
});

export const deliverAggregateBlocks = Effect.fn(
  'AggregateBlockRepo.deliverAggregateBlocks',
)(function* (props: {
  blocks: readonly unknown[];
  aggregateFrontendRepoName: string;
}) {
  const aggregateFrontendRepo = env.AGGREGATE_FRONTEND_REPO.getByName(
    props.aggregateFrontendRepoName,
  );
  yield* Effect.promise(() =>
    aggregateFrontendRepo.handleAggregateBlocks({
      blocks: props.blocks,
    }),
  );
});

declare const aggregateFrontendSubscribers: unknown;
declare const env: {
  AGGREGATE_FRONTEND_REPO: {
    getByName(name: string): {
      handleAggregateBlocks(props: {
        blocks: readonly unknown[];
      }): Promise<unknown>;
    };
  };
};
