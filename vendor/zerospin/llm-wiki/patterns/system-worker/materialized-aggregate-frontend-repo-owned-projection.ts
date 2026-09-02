import { Effect } from 'effect';

/**
 * MaterializedAggregateFrontendRepo owns authoritative source state, selection, projection, resolved push membership, and optimistic replay together.
 *
 * @bad Apply projection adapters before evaluating selection against the complete aggregate source graph.
 * @bad Publish the visible post-replay net change as the authoritative finalized delta.
 * @bad Drop a deleted source row before deriving the projected resource identity to delete.
 */
export const applyAggregateCommand = Effect.fn(
  'MaterializedAggregateFrontendRepo.applyAggregateCommand',
)(function* (props: {
  command: unknown;
  rewindOptimism(): Effect.Effect<void>;
  applyAuthoritativeDelta(command: unknown): Effect.Effect<unknown>;
  resolveOrigin(command: unknown): Effect.Effect<void>;
  replayUnresolved(): Effect.Effect<void>;
  insertFinalizedOutbox(delta: unknown): Effect.Effect<void>;
}) {
  yield* props.rewindOptimism();
  const authoritativeDelta = yield* props.applyAuthoritativeDelta(
    props.command,
  );
  yield* props.resolveOrigin(props.command);
  yield* props.replayUnresolved();
  yield* props.insertFinalizedOutbox(authoritativeDelta);
});
