import { memo, useMemo, useState } from 'react';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { getInitializedStateOrThrow } from '@zerospin/core/aggregateSession/getInitializedStateOrThrow';
import { sessionRepoDbConfig } from '@zerospin/core/aggregateSession/sessionRepoDbConfig';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '@zerospin/core/aggregateSession/types';

import type { IDevtoolsServiceSessionEntry } from '../../../../types';
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

export const SessionsCommandsTableBody = memo(
  function SessionsCommandsTableBody(props: {
    rows: Readonly<Record<string, unknown>>[];
    service?: boolean;
  }) {
    const { rows, service = false } = props;
    const columns = useMemo(
      () => makeSessionsCommandsTableColumns(service),
      [service],
    );
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
      getRowId: row => String(row.sessionIndex),
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

function LocalCommandsRowsTable<
  DEFINITION extends IAggregateSessionDefinition,
>(props: { readonly session: IAggregateSession<DEFINITION> }) {
  const { session } = props;
  const { db } = getInitializedStateOrThrow({ session });
  const { data: rows, error } = useLiveQueryOnDb({
    db,
    deps: [],
    query: db =>
      db
        .select()
        .from(sessionRepoDbConfig.schema.commands)
        .orderBy(sessionRepoDbConfig.schema.commands.sessionIndex)
        .$dynamic(),
    tableNames: ['commands'],
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

export function SessionsCommandsRowsTable<
  DEFINITION extends IAggregateSessionDefinition,
>(props: { readonly session: IAggregateSession<DEFINITION> }) {
  return <LocalCommandsRowsTable {...props} />;
}

export function ServiceCommandsRowsTable(props: {
  readonly session: IDevtoolsServiceSessionEntry;
}) {
  const db = props.session.getCommandDb();
  if (db === null) throw new Error('Service session is not initialized');
  const { data: rows, error } = useLiveQueryOnDb({
    db,
    deps: [],
    query: db =>
      db.query.commands!.findMany({ orderBy: { sessionIndex: 'asc' } }),
    tableNames: ['commands'],
  });
  if (error !== undefined) {
    return (
      <p style={sessionsDatabaseTabStyles.errorText}>
        Failed to load rows: {error.message}
      </p>
    );
  }
  return <SessionsCommandsTableBody rows={rows} service />;
}
