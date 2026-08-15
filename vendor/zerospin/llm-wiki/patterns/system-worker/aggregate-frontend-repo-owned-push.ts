import { Effect } from 'effect';

/**
 * Stamp frontend guard admission with one aggregate cursor and rerun those guards when AggregateRepo's post-alignment cursor differs.
 *
 * @bad Do not split one staged batch across projection and admission repos.
 * @bad Do not store pending pushed commands outside AggregateFrontendRepo.
 * @bad Do not rebuild a smaller aggregate command and discard the full frontend command provenance.
 * @bad Do not sort a mixed-session batch by stagedCursor or compare staged cursors across sessions.
 * @bad Do not attach one sessionId to the pushed block; each complete command owns its session provenance.
 * @bad Do not require a second status RPC after push; the push result returns every command's canonical lifecycle.
 * @bad Do not omit the nullable admission cursor from an immutable pushed block.
 * @bad Do not compare the cursors before retained ServiceBlock alignment finishes.
 * @bad Do not rerun guards when the post-alignment AggregateRepo cursor exactly matches the admission cursor.
 * @bad Do not let a matching cursor skip adaptation, preparation, authoritative mutation application, or fanout.
 */
export const pushCommands = Effect.fn('AggregateFrontendRepo.pushCommands')(
  function* (props: {
    stagedCommands: readonly {
      id: string;
      commandName: string;
      payload: unknown;
      sessionId: string;
      stagedCursor: string;
    }[];
    tx: unknown;
  }) {
    const { stagedCommands, tx } = props;
    const admissionLastAggregateCursor = yield* getLastAggregateCursor({ tx });
    const pushedCommands: unknown[] = [];
    const latestStagedCursorBySession = new Map<string, string>();

    // Preserve incoming SharedWorker order. Canonical lifecycle lookup by
    // command id or (sessionId, stagedCursor) occurs before this new-command
    // branch and returns that complete existing outcome directly.
    for (const stagedCommand of stagedCommands) {
      const priorSessionCursor = latestStagedCursorBySession.get(
        stagedCommand.sessionId,
      );
      if (
        priorSessionCursor !== undefined &&
        stagedCommand.stagedCursor <= priorSessionCursor
      ) {
        continue;
      }
      latestStagedCursorBySession.set(
        stagedCommand.sessionId,
        stagedCommand.stagedCursor,
      );
      const pushedCommand = yield* withSavepoint({
        tx,
        program: ({ tx: savepointTx }) =>
          admitOptimisticCommand({
            stagedCommand,
            tx: savepointTx,
          }),
      });
      insertFullPushedCommand({ tx, pushedCommand });
      pushedCommands.push(pushedCommand);
    }

    if (pushedCommands.length > 0) {
      insertImmutablePushedBlock({
        tx,
        block: {
          admissionLastAggregateCursor,
          commands: pushedCommands,
        },
      });
    }
    return pushedCommands;
  },
);

const finalizePushedCommands = Effect.fn(
  'AggregateRepo.finalizePushedCommands',
)(function* (props: {
  aggregateBlockOutbox: {
    findByPushedBlockId(id: string): unknown | undefined;
  };
  applyAuthoritativeMutation(props: {
    mutation: unknown;
    tx: unknown;
  }): Effect.Effect<unknown>;
  currentLastAggregateCursor: string | null;
  preparedCommands: readonly {
    fullEncodedCommand: {
      readonly [field: string]: unknown;
      userId: string;
      commandName: string;
      payload: unknown;
    };
    guards: readonly ((props: {
      userId: string;
      db: unknown;
      payload: unknown;
    }) => Effect.Effect<unknown>)[];
    validatedFrontendPayload: unknown;
    authoritativeMutations: readonly unknown[];
  }[];
  pushedBlock: {
    id: string;
    admissionLastAggregateCursor: string | null;
    commands: readonly unknown[];
  };
  relevantIntermediateAggregateBlocks: readonly {
    lastAggregateCursor: string;
  }[];
  tx: unknown;
}) {
  const {
    aggregateBlockOutbox,
    currentLastAggregateCursor: persistedLastAggregateCursor,
    preparedCommands,
    pushedBlock,
    relevantIntermediateAggregateBlocks,
    tx,
  } = props;

  // 1 — pushed-block idempotency wins before any cursor or guard decision
  const existingOutcome = aggregateBlockOutbox.findByPushedBlockId(
    pushedBlock.id,
  );
  if (existingOutcome !== undefined) {
    return existingOutcome;
  }

  /*
   * 2 — the existing domain path has already adapted every full pushed command
   * and prepared its authoritative mutations. Retained ServiceBlocks are still
   * applied explicitly before choosing whether the frontend guards are trusted.
   */
  let currentLastAggregateCursor = persistedLastAggregateCursor;
  for (const intermediateAggregateBlock of relevantIntermediateAggregateBlocks) {
    currentLastAggregateCursor = intermediateAggregateBlock.lastAggregateCursor;
  }

  // 3 — one exact opaque-cursor comparison selects the mode for every sibling
  const shouldRevalidateGuards =
    currentLastAggregateCursor !== pushedBlock.admissionLastAggregateCursor;
  const outcomes: unknown[] = [];

  // 4 — command order and savepoints make earlier successful siblings visible
  for (const preparedCommand of preparedCommands) {
    const finalized = yield* withSavepoint({
      tx,
      program: Effect.fn('AggregateRepo.finalizePushedCommands.command')(
        function* ({ tx: savepointTx }) {
          if (shouldRevalidateGuards) {
            for (const guard of preparedCommand.guards) {
              yield* guard({
                userId: preparedCommand.fullEncodedCommand.userId,
                db: savepointTx,
                payload: preparedCommand.validatedFrontendPayload,
              });
            }
          }

          // 5 — trusted and revalidated modes share the authoritative path
          for (const mutation of preparedCommand.authoritativeMutations) {
            yield* props.applyAuthoritativeMutation({
              mutation,
              tx: savepointTx,
            });
          }

          return preparedCommand.fullEncodedCommand;
        },
      ),
    }).pipe(Effect.either);
    outcomes.push(finalized);
  }

  return outcomes;
});

declare function withSavepoint(props: {
  tx: unknown;
  program: (props: { tx: unknown }) => Effect.Effect<unknown>;
}): Effect.Effect<unknown>;
declare function admitOptimisticCommand(props: {
  stagedCommand: unknown;
  tx: unknown;
}): Effect.Effect<unknown>;
declare function getLastAggregateCursor(props: {
  tx: unknown;
}): Effect.Effect<string | null>;
declare function insertFullPushedCommand(props: {
  tx: unknown;
  pushedCommand: unknown;
}): void;
declare function insertImmutablePushedBlock(props: {
  tx: unknown;
  block: {
    admissionLastAggregateCursor: string | null;
    commands: readonly unknown[];
  };
}): void;
