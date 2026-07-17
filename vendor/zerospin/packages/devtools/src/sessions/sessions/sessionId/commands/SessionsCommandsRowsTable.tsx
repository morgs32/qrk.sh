import { memo, useEffect, useMemo, useState } from "react";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { getInitializedStateOrThrow } from "@zerospin/core/session/getInitializedStateOrThrow";
import type { ISession } from "@zerospin/core/session/types";

import { useLiveQueryOnDb } from "../../../../useLiveQueryOnDb";
import { SessionsDataCell } from "../../../SessionsDataCell";
import { sessionsDatabaseTabStyles } from "../database/sessionsDatabaseTabStyles";

import { SessionsCommandsColumnPicker } from "./SessionsCommandsColumnPicker";
import {
  defaultColumnVisibilityForStatus,
  formatCommandCellValue,
  isSessionsCommandsCopyCellColumn,
  makeSessionsCommandsTableColumns,
  truncateCommandDisplayText,
  type IDevtoolsSessionCommandsStatus,
} from "./sessionsCommandsTableColumns";

type ISessionsCommandsTableName =
  | "stagedCommands"
  | "pushedCommands"
  | "executedPushedCommands"
  | "failedCommands";

function devtoolsStatusToTableNames(
  status: IDevtoolsSessionCommandsStatus,
): readonly ISessionsCommandsTableName[] {
  switch (status) {
    case "staged":
      return ["stagedCommands"];
    case "pushed":
      return ["pushedCommands"];
    case "executed":
      return ["executedPushedCommands"];
    case "failed":
      return ["failedCommands"];
    default: {
      const exhaustive: never = status;
      throw new Error(`Unsupported command status: ${exhaustive}`);
    }
  }
}

const SessionsCommandsTableBody = memo(
  function SessionsCommandsTableBody(props: {
    rows: Readonly<Record<string, unknown>>[];
    status: IDevtoolsSessionCommandsStatus;
  }) {
    const { rows, status } = props;
    const columns = useMemo(() => makeSessionsCommandsTableColumns(), []);
    const defaultVisibility = useMemo(
      () => defaultColumnVisibilityForStatus(status),
      [status],
    );
    const [columnVisibility, setColumnVisibility] =
      useState<VisibilityState>(defaultVisibility);

    useEffect(() => {
      setColumnVisibility(defaultVisibility);
    }, [defaultVisibility]);

    const table = useReactTable({
      columns,
      data: rows,
      defaultColumn: {
        maxSize: 320,
        minSize: 60,
        size: 120,
      },
      getCoreRowModel: getCoreRowModel(),
      getRowId: (row) => String(row.id),
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
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
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
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => {
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
  readonly status: IDevtoolsSessionCommandsStatus;
}) {
  const { session, status } = props;
  const { db } = getInitializedStateOrThrow({ session });
  const tableNames = devtoolsStatusToTableNames(status);
  const { data: rows, error } = useLiveQueryOnDb({
    db,
    deps: [status],
    query: (db) => {
      switch (status) {
        case "staged":
          return db.query.stagedCommands!.findMany();
        case "pushed":
          return db.query.pushedCommands!.findMany();
        case "executed":
          return db.query.executedPushedCommands!.findMany();
        case "failed":
          return db.query.failedCommands!.findMany();
        default: {
          const exhaustive: never = status;
          throw new Error(`Unsupported command status: ${exhaustive}`);
        }
      }
    },
    tableNames,
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
      <p style={{ margin: 0, fontSize: "0.85rem", padding: 8 }}>No rows.</p>
    );
  }

  return <SessionsCommandsTableBody rows={rows} status={status} />;
}
