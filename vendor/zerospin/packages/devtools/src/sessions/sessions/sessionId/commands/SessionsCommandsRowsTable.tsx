import { memo, useMemo, useState } from 'react';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { getInitializedStateOrThrow } from '@zerospin/core/session/getInitializedStateOrThrow';
import type { ISession } from '@zerospin/core/session/types';

import { useLiveQueryOnDb } from '../../../../useLiveQueryOnDb';
import { SessionsDataCell } from '../../../SessionsDataCell';
import { sessionsDatabaseTabStyles } from '../database/sessionsDatabaseTabStyles';

import { SessionsCommandsColumnPicker } from './SessionsCommandsColumnPicker';
import {
  formatCommandCellValue,
  isSessionsCommandsCopyCellColumn,
  makeSessionsCommandsTableColumns,
  truncateCommandDisplayText,
} from './sessionsCommandsTableColumns';

const SessionsCommandsTableBody = memo(
  function SessionsCommandsTableBody(props: {
    rows: Readonly<Record<string, unknown>>[];
  }) {
    const { rows } = props;
    const columns = useMemo(() => makeSessionsCommandsTableColumns(), []);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
      {},
    );

    const table = useReactTable({
      columns,
      data: rows,
      defaultColumn: {
        maxSize: 320,
        minSize: 60,
        size: 120,
      },
      getCoreRowModel: getCoreRowModel(),
      getRowId: row => String(row.id),
      onColumnVisibilityChange: setColumnVisibility,
      state: {
        columnVisibility,
      },
    });

    return (
      <div style={sessionsDatabaseTabStyles.tableScroll}>
        <div style={sessionsDatabaseTabStyles.tableToolbar}>
          <SessionsCommandsColumnPicker table={table} />
        </div>
        <table
          style={{
            ...sessionsDatabaseTabStyles.tableFixed,
            width: table.getTotalSize(),
          }}
        >
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    style={{
                      ...sessionsDatabaseTabStyles.tableThSticky,
                      width: header.getSize(),
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id}>
                {row.getVisibleCells().map(cell => {
                  const fullText = formatCommandCellValue(cell.getValue());
                  const displayText = truncateCommandDisplayText(fullText);
                  const tdStyle = {
                    ...sessionsDatabaseTabStyles.tableTdEllipsis,
                    width: cell.column.getSize(),
                  };

                  if (isSessionsCommandsCopyCellColumn(cell.column.id)) {
                    return (
                      <SessionsDataCell
                        key={cell.id}
                        ariaLabel={`Copy ${cell.column.id}`}
                        tdStyle={tdStyle}
                        text={fullText}
                      />
                    );
                  }

                  return (
                    <td key={cell.id} style={tdStyle} title={fullText}>
                      {displayText}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
);

export function SessionsCommandsRowsTable(props: {
  readonly session: ISession;
}) {
  const { session } = props;
  const { db } = getInitializedStateOrThrow({ session });
  const { data: rows, error } = useLiveQueryOnDb({
    db,
    deps: [],
    query: db => db.query.commandJournal!.findMany(),
    tableNames: ['commandJournal'],
  });

  if (error !== undefined) {
    return (
      <p style={sessionsDatabaseTabStyles.errorText}>
        Failed to load rows: {error.message}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: '0.85rem', padding: 8 }}>No rows.</p>
    );
  }

  return <SessionsCommandsTableBody rows={rows} />;
}
