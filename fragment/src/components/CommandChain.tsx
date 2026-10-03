import { useImperativeHandle, useState, type Ref } from 'react';

import { useStore } from 'zustand';

import {
  createCommandChainStore,
  type CommandChainHandle,
  type CommandRow,
} from './commandChainStore';
import './CommandChain.css';

export type {
  CommandChainHandle,
  CommandCell,
  CommandRow,
} from './commandChainStore';

export function CommandChain({
  initialRows,
  maxRows = 24,
  ref,
}: {
  initialRows: readonly CommandRow[];
  maxRows?: number;
  ref?: Ref<CommandChainHandle>;
}) {
  const [store] = useState(() => createCommandChainStore(initialRows, maxRows));
  const rows = useStore(store, state => state.rows);
  const enteringRowId = useStore(store, state => state.enteringRowId);
  useImperativeHandle(
    ref,
    () => ({ apply: store.getState().apply, reset: store.getState().reset }),
    [store],
  );
  return (
    <div className="command-chain-stage">
      <table className="command-chain-table">
        <caption>Command Chain</caption>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              {row.cells.map((cell, column) => (
                <td key={column}>
                  <span
                    className={`command-chain-cell-content${row.id === enteringRowId ? ' is-entering' : ''}`}
                  >
                    <span className={cell.blurred ? 'is-blurred' : 'is-sharp'}>
                      {cell.text}
                    </span>
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
