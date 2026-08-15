import { Effect } from 'effect';

/**
 * AggregateRepo commits a complete block outbox row, then publishes it to AggregateBlockRepo after the transaction.
 *
 * @bad Publish downstream before the authoritative transaction commits.
 * @bad Deliver aggregate blocks through ActorRepo or ActorBlockRepo.
 * @bad Rebuild executed or failed commands into smaller fanout payloads.
 */
export const finalizeAggregateBlock = Effect.fn(
  'AggregateRepo.finalizeAggregateBlock',
)(function* (props: {
  aggregateId: string;
  aggregateName: string;
  commands: readonly unknown[];
  db: unknown;
}) {
  const block = yield* makeTx({
    db: props.db,
    program: Effect.fn('AggregateRepo.finalizeAggregateBlock.transaction')(
      function* ({ tx }) {
        const outcome = yield* executeAggregateCommands({
          commands: props.commands,
          tx,
        });

        return yield* insertAggregateBlockOutbox({
          aggregateId: props.aggregateId,
          aggregateName: props.aggregateName,
          appliedMutations: outcome.appliedMutations,
          executedCommands: outcome.executedCommands,
          failedCommands: outcome.failedCommands,
          tx,
        });
      },
    ),
  });

  return block;
});

export const drainAggregateOutboxes = Effect.fn(
  'AggregateRepo.drainAggregateOutboxes',
)(function* (props: {
  aggregateBlockRepo: {
    publish(props: { blocks: readonly unknown[] }): Promise<unknown>;
  };
  block: unknown;
}) {
  yield* Effect.promise(() =>
    props.aggregateBlockRepo.publish({ blocks: [props.block] }),
  );
});

declare function makeTx(props: {
  db: unknown;
  program: (props: { tx: unknown }) => Effect.Effect<unknown, unknown>;
}): Effect.Effect<unknown, unknown>;
declare function executeAggregateCommands(props: {
  commands: readonly unknown[];
  tx: unknown;
}): Effect.Effect<{
  appliedMutations: readonly unknown[];
  executedCommands: readonly unknown[];
  failedCommands: readonly unknown[];
}>;
declare function insertAggregateBlockOutbox(props: {
  aggregateId: string;
  aggregateName: string;
  appliedMutations: readonly unknown[];
  executedCommands: readonly unknown[];
  failedCommands: readonly unknown[];
  tx: unknown;
}): Effect.Effect<unknown>;
