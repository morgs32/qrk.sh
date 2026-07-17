import { Effect } from 'effect';

/**
 * Stamp frontend guard admission with one account cursor and rerun those guards when AccountRepo's post-alignment cursor differs.
 *
 * @bad Do not split one staged batch between ActorRepo push and FrontendRepo registration RPCs.
 * @bad Do not store pending pushed commands or push-specific test hooks in ActorRepo.
 * @bad Do not rebuild a smaller actor/account command and discard the full frontend command provenance.
 * @bad Do not omit the nullable admission cursor from an immutable pushed block.
 * @bad Do not compare the cursors before retained ServiceBlock alignment finishes.
 * @bad Do not rerun guards when the post-alignment AccountRepo cursor exactly matches the admission cursor.
 * @bad Do not let a matching cursor skip adaptation, preparation, authoritative mutation application, or fanout.
 */
export const pushCommands = Effect.fn('FrontendRepo.pushCommands')(
  function* (props: {
    stagedCommand: { id: string; commandName: string; payload: unknown };
    tx: unknown;
  }) {
    const { stagedCommand, tx } = props;
    const admissionLastAccountCursor = yield* getLastAccountCursor({ tx });
    const pushedCommand = yield* withSavepoint({
      tx,
      program: ({ tx: savepointTx }) =>
        admitOptimisticCommand({
          stagedCommand,
          tx: savepointTx,
        }),
    });

    insertFullPushedCommand({ tx, pushedCommand });
    insertImmutablePushedBlock({
      tx,
      block: {
        admissionLastAccountCursor,
        commands: [pushedCommand],
      },
    });
    return pushedCommand;
  },
);

const finalizePushedCommands = Effect.fn(
  'AccountRepo.finalizePushedCommands',
)(function* (props: {
  accountBlockOutbox: {
    findByPushedBlockId(id: string): unknown | undefined;
  };
  applyAuthoritativeMutation(props: {
    mutation: unknown;
    tx: unknown;
  }): Effect.Effect<unknown>;
  currentLastAccountCursor: string | null;
  preparedCommands: readonly {
    fullEncodedCommand: {
      readonly [field: string]: unknown;
      actorId: string;
      commandName: string;
      payload: unknown;
    };
    guards: readonly ((props: {
      actorId: string;
      db: unknown;
      payload: unknown;
    }) => Effect.Effect<unknown>)[];
    validatedFrontendPayload: unknown;
    authoritativeMutations: readonly unknown[];
  }[];
  pushedBlock: {
    id: string;
    admissionLastAccountCursor: string | null;
    commands: readonly unknown[];
  };
  relevantIntermediateAccountBlocks: readonly {
    lastAccountCursor: string;
  }[];
  tx: unknown;
}) {
  const {
    accountBlockOutbox,
    currentLastAccountCursor: persistedLastAccountCursor,
    preparedCommands,
    pushedBlock,
    relevantIntermediateAccountBlocks,
    tx,
  } = props;

  // 1 — pushed-block idempotency wins before any cursor or guard decision
  const existingOutcome = accountBlockOutbox.findByPushedBlockId(
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
  let currentLastAccountCursor = persistedLastAccountCursor;
  for (const intermediateAccountBlock of relevantIntermediateAccountBlocks) {
    currentLastAccountCursor = intermediateAccountBlock.lastAccountCursor;
  }

  // 3 — one exact opaque-cursor comparison selects the mode for every sibling
  const shouldRevalidateGuards =
    currentLastAccountCursor !== pushedBlock.admissionLastAccountCursor;
  const outcomes: unknown[] = [];

  // 4 — command order and savepoints make earlier successful siblings visible
  for (const preparedCommand of preparedCommands) {
    const finalized = yield* withSavepoint({
      tx,
      program: Effect.fn('AccountRepo.finalizePushedCommands.command')(
        function* ({ tx: savepointTx }) {
          if (shouldRevalidateGuards) {
            for (const guard of preparedCommand.guards) {
              yield* guard({
                actorId: preparedCommand.fullEncodedCommand.actorId,
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
declare function getLastAccountCursor(props: {
  tx: unknown;
}): Effect.Effect<string | null>;
declare function insertFullPushedCommand(props: {
  tx: unknown;
  pushedCommand: unknown;
}): void;
declare function insertImmutablePushedBlock(props: {
  tx: unknown;
  block: {
    admissionLastAccountCursor: string | null;
    commands: readonly unknown[];
  };
}): void;
