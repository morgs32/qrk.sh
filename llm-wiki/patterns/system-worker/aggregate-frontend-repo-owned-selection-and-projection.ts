import { Effect } from 'effect';

/**
 * AggregateFrontendRepo owns the aggregate source replica, actor selection, and current frontend projection together.
 *
 * @bad Keep selected source state in ActorRepo and projected state in AggregateFrontendRepo.
 * @bad Apply projection adapters before evaluating selection against the complete aggregate source graph.
 * @bad Drop a deleted source row before deriving the projected resource identity to delete.
 */
export const handleAggregateBlocks = Effect.fn(
  'AggregateFrontendRepo.handleAggregateBlocks',
)(function* (props: {
  userId: string;
  blocks: readonly { appliedMutations: readonly unknown[] }[];
  tx: unknown;
}) {
  for (const block of props.blocks) {
    const sourceChanges = yield* applyAggregateSourceMutations({
      mutations: block.appliedMutations,
      tx: props.tx,
    });

    const selectedChanges = yield* evaluateSelections({
      userId: props.userId,
      sourceChanges,
      tx: props.tx,
    });

    const projectedChanges = yield* projectCurrentFrontendResources({
      selectedChanges,
      tx: props.tx,
    });

    yield* insertCanonicalFrontendBlock({
      changes: projectedChanges,
      tx: props.tx,
    });
  }
});

declare function applyAggregateSourceMutations(props: {
  mutations: readonly unknown[];
  tx: unknown;
}): Effect.Effect<readonly unknown[]>;
declare function evaluateSelections(props: {
  userId: string;
  sourceChanges: readonly unknown[];
  tx: unknown;
}): Effect.Effect<readonly unknown[]>;
declare function projectCurrentFrontendResources(props: {
  selectedChanges: readonly unknown[];
  tx: unknown;
}): Effect.Effect<readonly unknown[]>;
declare function insertCanonicalFrontendBlock(props: {
  changes: readonly unknown[];
  tx: unknown;
}): Effect.Effect<void>;
