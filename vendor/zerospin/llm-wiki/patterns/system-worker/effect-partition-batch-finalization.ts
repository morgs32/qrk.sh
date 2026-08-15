import { Effect } from 'effect';

/**
 * Finalize each aggregate command independently inside one transaction block.
 *
 * @bad Use `Effect.validateAll` so one failure rejects the whole batch.
 * @bad Run partition with `concurrency: 'unbounded'` on one aggregate DB.
 * @bad Let one command throw and abort the entire aggregate block run.
 */
export const finalizeCommandsTx = Effect.fn('finalizeCommandsTx')(
  function* (props: { commands: readonly { id: string }[]; tx: unknown }) {
    const { commands, tx } = props;
    const executedCommands: unknown[] = [];
    const failedCommands: unknown[] = [];

    for (const command of commands) {
      const either = yield* Effect.either(finalizeOneCommand({ tx, command }));

      if (either._tag === 'Left') {
        failedCommands.push({ command, failure: either.left });
        continue;
      }

      executedCommands.push(either.right);
    }

    return { executedCommands, failedCommands, appliedMutations: [] };
  },
);

declare function finalizeOneCommand(props: {
  tx: unknown;
  command: { id: string };
}): Effect.Effect<unknown, unknown, unknown>;
