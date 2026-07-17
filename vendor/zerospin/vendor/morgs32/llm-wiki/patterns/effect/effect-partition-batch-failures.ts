import { Effect } from 'effect';

declare function finalizeOneCommand(props: {
  command: { id: string };
}): Effect.Effect<
  { executedCommand: unknown; mutations: unknown[] },
  unknown,
  never
>;

/**
 * Effect.partition for per-item batch failures with catchAll → Effect.fail(row).
 *
 * @bad Manual for-loop with maybe* + Either.isLeft at every step.
 * @bad Effect.validateAll when any item failure should fail the whole batch.
 */
export const finalizeBatch = Effect.fn('finalizeBatch')(function* (props: {
  commands: readonly { id: string }[];
  now: number;
}) {
  const { commands, now } = props;
  const [failedCommands, successes] = yield* Effect.partition(
    commands,
    command =>
      finalizeOneCommand({ command }).pipe(
        Effect.catchAll(cause =>
          Effect.fail({
            ...command,
            failedAt: now,
            failure: String(cause),
            status: 'failed' as const,
          }),
        ),
      ),
  );

  const executedCommands = successes.map(
    ({ executedCommand }) => executedCommand,
  );
  const mutations = successes.flatMap(({ mutations }) => mutations);
  return { failedCommands, executedCommands, mutations };
});
