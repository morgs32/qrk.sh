import { memo, useEffect, useMemo, useState } from 'react';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { getInitializedStateOrThrow } from '@zerospin/core/aggregateSession/getInitializedStateOrThrow';
import type { IAggregateSession } from '@zerospin/core/aggregateSession/types';
import { useStore } from 'zustand/react';

import type { IDevtoolsAggregateSessionEntry } from '../../../../types';
import { useLiveQueryOnDb } from '../../../../useLiveQueryOnDb';
import { zerospinDevtoolsStore } from '../../../../zerospinDevtoolsStore';
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
    node?: boolean;
  }) {
    const { rows, node = false } = props;
    const columns = useMemo(
      () => makeSessionsCommandsTableColumns(node),
      [node],
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

function LocalCommandsRowsTable(props: {
  readonly session: IAggregateSession;
}) {
  const { session } = props;
  const { db } = getInitializedStateOrThrow({ session });
  const { data: rows, error } = useLiveQueryOnDb({
    db,
    deps: [],
    query: db => db.query.commands!.findMany(),
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

function NodeCommandsRowsTable(props: {
  history: NonNullable<IDevtoolsAggregateSessionEntry['history']>;
}) {
  const { history } = props;
  const [after, setAfter] = useState(0);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<Readonly<Record<string, unknown>>[]>([]);
  const [failure, setFailure] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    setLoading(true);
    void history({ afterNodeIndex: after, limit: 50 })
      .then(
        page => {
          if (current) {
            setRows([...page]);
            setFailure('');
          }
        },
        error => {
          if (current) setFailure(String(error));
        },
      )
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [history, after, revision]);
  const last = rows.at(-1)?.nodeIndex;
  return (
    <>
      <div style={sessionsDatabaseTabStyles.tableToolbar}>
        <button
          disabled={loading}
          onClick={() => {
            setAfter(0);
            setRevision(value => value + 1);
          }}
        >
          Refresh
        </button>
        <button
          disabled={loading || rows.length < 50 || typeof last !== 'number'}
          onClick={() => {
            if (typeof last === 'number') setAfter(last);
          }}
        >
          Next 50
        </button>
        <span>
          {loading
            ? 'Loading…'
            : `${rows.length} commands after nodeIndex ${after}`}
        </span>
        {failure && <span role="alert">{failure}</span>}
      </div>
      <SessionsCommandsTableBody rows={rows} node />
    </>
  );
}

export function SessionsCommandsRowsTable(props: {
  readonly session: IAggregateSession;
}) {
  const history = useStore(zerospinDevtoolsStore, state =>
    props.session.sessionId === null
      ? undefined
      : state.aggregateSessionsById.get(props.session.sessionId)?.history,
  );
  return history === undefined ? (
    <LocalCommandsRowsTable {...props} />
  ) : (
    <NodeCommandsRowsTable history={history} />
  );
}
