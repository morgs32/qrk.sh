import { Schema } from 'effect';

/**
 * DO SQLite caps bound parameters at 100 — insert one command occurrence per statement.
 *
 * @bad Bulk `insert().values([...])` with many terminal command occurrences in one statement.
 */
export function insertTerminalCommands(props: {
  tx: {
    insert: (table: unknown) => {
      values: (row: unknown) => { run: () => void };
    };
  };
  chainCommandsTable: unknown;
  terminalCommands: readonly unknown[];
}) {
  const { chainCommandsTable, terminalCommands, tx } = props;

  for (const terminalCommand of terminalCommands) {
    tx.insert(chainCommandsTable)
      .values(Schema.encodeSync(TerminalCommandSchema)(terminalCommand))
      .run();
  }
}

declare const TerminalCommandSchema: unknown;
