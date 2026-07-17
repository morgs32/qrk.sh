import { Effect } from 'effect';

type InferRow<T> = T extends { readonly _row: infer R } ? R : unknown;

interface IPushedCommand {
  id: string;
  commandName: string;
  payload: unknown;
}

declare function encodeCommand(props: {
  contract: unknown;
  command: IPushedCommand;
}): Effect.Effect<{ payload: string } & IPushedCommand, unknown, never>;

declare const sessionExecutedPushedCommandDrizzleSchema: unknown;
declare const actorPushedCommandsDrizzleSchema: unknown;

declare function upsertHelper(props: {
  table: unknown;
  tx: unknown;
  values: unknown;
}): void;

/**
 * Spread encoded commands into Drizzle `.values()` / `.set()` — no column-by-column row mappers.
 *
 * @bad `mapPushedSessionCommandRow` / `toSessionPublishedCommandRow` copying every column the shape already defines.
 */
export const persistPublishedCommand = Effect.fn('persistPublishedCommand')(
  function* (props: {
    tx: unknown;
    contract: unknown;
    command: IPushedCommand;
    pushedAt: Date;
    pushedCursor: string;
  }) {
    const { tx, contract, command, pushedAt, pushedCursor } = props;

    const encoded = yield* encodeCommand({ contract, command });

    upsertHelper({
      table: sessionExecutedPushedCommandDrizzleSchema,
      tx,
      values: encoded,
    });

    void actorPushedCommandsDrizzleSchema;
    void pushedAt;
    void pushedCursor;
    void (command.payload as string);

    return encoded satisfies InferRow<{ readonly _row: typeof encoded }>;
  },
);
