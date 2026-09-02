import { Effect } from 'effect';

/**
 * Subscribe before catch-up, pull terminal command pages, and acknowledge only after local state and output commit together.
 *
 * @bad Treat a coalesced latest-tip notification as the complete missing history.
 * @bad Advance the subscriber frontier before the materialized Repo transaction commits.
 * @bad Re-execute authored code while filling a history gap; this path applies retained terminal commands.
 */
export const catchup = Effect.fn('MaterializedRepo.catchup')(function* (props: {
  afterIndex: number | null;
  chain: {
    getCommands(props: { afterIndex: number | null }): PromiseLike<{
      commands: readonly { index: number }[];
      tip: number | null;
    }>;
  };
  applyAndAcknowledge(
    commands: readonly { index: number }[],
  ): Effect.Effect<number | null>;
}) {
  let currentIndex = props.afterIndex;

  while (true) {
    const page = yield* Effect.promise(() =>
      props.chain.getCommands({ afterIndex: currentIndex }),
    );
    if (page.commands.length === 0) {
      return currentIndex;
    }

    currentIndex = yield* props.applyAndAcknowledge(page.commands);
    if (currentIndex === page.tip) {
      return currentIndex;
    }
  }
});
