import { Schema } from 'effect/Schema';

/**
 * DO SQLite caps bound parameters at 100 — insert one command row per statement.
 *
 * @bad Bulk `insert().values([...])` with many executed command rows in one statement.
 */
export function insertExecutedCommands(props: {
  tx: {
    insert: (table: unknown) => {
      values: (row: unknown) => { run: () => void };
    };
  };
  commandDrizzleSchema: unknown;
  executedCommands: readonly unknown[];
}) {
  const { tx, commandDrizzleSchema, executedCommands } = props;

  for (const executedCommand of executedCommands) {
    tx.insert(commandDrizzleSchema)
      .values(Schema.encodeSync(ExecutedCommandSchema)(executedCommand))
      .run();
  }
}

declare const ExecutedCommandSchema: unknown;
