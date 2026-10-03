import { createStore } from 'zustand/vanilla';

export type CommandCell = { text: string; blurred: boolean };
export type CommandRow = { id: number; cells: readonly CommandCell[] };
export type CommandChainUpdate = {
  prepend?: CommandRow;
  cellUpdates?: readonly {
    rowId: number;
    column: number;
    cell: Partial<CommandCell>;
  }[];
};
export type CommandChainHandle = {
  apply: (update: CommandChainUpdate) => void;
  reset: () => void;
};

type State = CommandChainHandle & {
  rows: readonly CommandRow[];
  enteringRowId: number | null;
};

export function createCommandChainStore(
  initialRows: readonly CommandRow[],
  maxRows = 24,
) {
  const seed = initialRows.slice(0, maxRows).map(row => ({
    ...row,
    cells: row.cells.map(cell => ({ ...cell })),
  }));
  return createStore<State>(set => ({
    rows: seed,
    enteringRowId: null,
    apply: ({ prepend, cellUpdates = [] }) =>
      set(state => {
        const rows = prepend
          ? [prepend, ...state.rows.filter(row => row.id !== prepend.id)].slice(
              0,
              maxRows,
            )
          : state.rows;
        return {
          rows: rows.map(row => ({
            ...row,
            cells: row.cells.map((cell, column) =>
              cellUpdates
                .filter(
                  update => update.rowId === row.id && update.column === column,
                )
                .reduce(
                  (value, update) => ({ ...value, ...update.cell }),
                  cell,
                ),
            ),
          })),
          enteringRowId: prepend ? prepend.id : state.enteringRowId,
        };
      }),
    reset: () => set({ rows: seed, enteringRowId: null }),
  }));
}
