import { useEffect, useState, type ReactNode } from 'react';

import { KeyIcon, RefreshCwIcon, XIcon } from 'lucide-react';
import { collapseAllNested, JsonView } from 'react-json-view-lite';
import { Group, Panel, Separator } from 'react-resizable-panels';

import { Button } from './components/ui/button.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './components/ui/table.js';

type ITableBrowserColumn = {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
};
export type IJsonCell = {
  data: object;
  columnName: string;
  rowKey: string;
  rowNumber: number;
};

export function TableInspector({
  title,
  subtitle,
  label,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-background"
      aria-label={label}
    >
      <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <h2 className="min-w-0 truncate font-mono text-sm font-medium">
          {title}
        </h2>
        {subtitle !== undefined && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {subtitle}
          </span>
        )}
        <Button
          aria-label={`Close ${label}`}
          className="ml-auto"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 text-sm">{children}</div>
    </aside>
  );
}

export function JsonInspector({
  cell,
  onClose,
}: {
  cell: IJsonCell;
  onClose: () => void;
}) {
  return (
    <TableInspector
      title={cell.columnName}
      subtitle={`Row ${cell.rowNumber}`}
      label="JSON inspector"
      onClose={onClose}
    >
      <div className="font-mono">
        <JsonView
          aria-label={`JSON for row ${cell.rowNumber} ${cell.columnName}`}
          clickToExpandNode
          data={cell.data}
          shouldExpandNode={collapseAllNested}
        />
      </div>
    </TableInspector>
  );
}

function display(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function jsonObject(value: unknown): object | null {
  if (value instanceof Date) return null;
  if (typeof value === 'object' && value !== null) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function TableBrowser({
  breadcrumbs,
  sidebarLabel,
  names,
  selectedName,
  onSelect,
  sidebarStatus,
  columns,
  rows,
  loading,
  error,
  onRefresh,
  status,
  emptyMessage = 'No rows.',
  actions,
  selectedJsonCell,
  onInspectJson,
  inspector,
}: {
  breadcrumbs: ReactNode;
  sidebarLabel: string;
  names: readonly string[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  sidebarStatus?: ReactNode;
  columns: readonly ITableBrowserColumn[];
  rows: readonly Record<string, unknown>[];
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  status?: ReactNode;
  emptyMessage?: string;
  actions?:
    | ((row: Record<string, unknown>, rowNumber: number) => ReactNode)
    | undefined;
  selectedJsonCell?: IJsonCell | null;
  onInspectJson: (cell: IJsonCell) => void;
  inspector?: ReactNode;
}) {
  const [compact, setCompact] = useState(
    () => window.matchMedia('(max-width: 1023px)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const hasInspector = inspector !== undefined && inspector !== null;
  return (
    <main className="flex h-screen min-w-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm">
        {breadcrumbs}
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-40 shrink-0 flex-col border-r lg:w-72">
          <div className="border-b px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {sidebarLabel}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {sidebarStatus}
            {names.map(name => (
              <button
                key={name}
                type="button"
                data-table-name={name}
                aria-pressed={selectedName === name}
                className={`flex w-full px-4 py-2 text-left font-mono text-sm transition-colors ${selectedName === name ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
                onClick={() => onSelect(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </aside>
        <Group
          id="table-and-inspector"
          className="min-h-0 min-w-0 flex-1"
          orientation={compact ? 'vertical' : 'horizontal'}
        >
          <Panel
            id="table"
            className="min-h-0 min-w-0"
            defaultSize={!hasInspector ? '100%' : compact ? '60%' : '65%'}
            minSize={compact ? '30%' : '40%'}
          >
            <section className="flex h-full min-h-0 min-w-0 flex-col">
              {selectedName === null ? (
                <>
                  {error !== undefined && error !== null && (
                    <p
                      role="alert"
                      className="border-b px-4 py-3 text-sm text-destructive"
                    >
                      {error}
                    </p>
                  )}
                  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    {names.length === 0
                      ? `No ${sidebarLabel.toLowerCase()} declared.`
                      : `Select a ${sidebarLabel.toLowerCase().replace(/s$/, '')} from the sidebar.`}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
                    <h2 className="font-mono text-sm font-medium">
                      {selectedName}
                    </h2>
                    {status}
                    <Button
                      aria-label="Refresh table"
                      className="ml-auto"
                      variant="outline"
                      size="icon-sm"
                      disabled={loading}
                      onClick={onRefresh}
                    >
                      <RefreshCwIcon
                        className={loading ? 'animate-spin' : undefined}
                      />
                    </Button>
                  </div>
                  {error !== undefined && error !== null && (
                    <p
                      role="alert"
                      className="border-b px-4 py-3 text-sm text-destructive"
                    >
                      {error}
                    </p>
                  )}
                  <div className="min-h-0 flex-1 overflow-auto">
                    <Table className="min-w-max border-b">
                      <TableHeader className="sticky top-0 z-10 bg-background">
                        <TableRow>
                          <TableHead className="w-12 border-r text-center text-muted-foreground">
                            #
                          </TableHead>
                          {columns.map(column => (
                            <TableHead
                              key={column.name}
                              className="border-r font-mono"
                            >
                              <span className="flex items-center gap-2">
                                {column.isPrimaryKey && (
                                  <KeyIcon className="size-3.5 text-amber-600" />
                                )}
                                {column.name}
                                <span className="text-xs font-normal text-muted-foreground">
                                  {column.type}
                                </span>
                              </span>
                            </TableHead>
                          ))}
                          {actions !== undefined && (
                            <TableHead className="border-r">Actions</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={
                                columns.length +
                                1 +
                                (actions === undefined ? 0 : 1)
                              }
                              className="h-24 text-center text-muted-foreground"
                            >
                              {loading ? 'Loading rows…' : emptyMessage}
                            </TableCell>
                          </TableRow>
                        )}
                        {rows.map((row, index) => {
                          const rowKey = String(row.id ?? index);
                          return (
                            <TableRow key={rowKey} data-row-id={rowKey}>
                              <TableCell className="border-r text-center text-muted-foreground">
                                {index + 1}
                              </TableCell>
                              {columns.map(column => {
                                const value = row[column.name];
                                const data = jsonObject(value);
                                const selected =
                                  data !== null &&
                                  selectedJsonCell?.columnName ===
                                    column.name &&
                                  selectedJsonCell.rowKey === rowKey;
                                return (
                                  <TableCell
                                    key={column.name}
                                    data-field={column.name}
                                    data-state={
                                      selected ? 'selected' : undefined
                                    }
                                    className={`max-w-96 border-r font-mono ${data === null ? '' : 'p-0'} ${selected ? 'bg-accent ring-1 ring-inset ring-ring' : ''}`}
                                  >
                                    {data === null ? (
                                      <span
                                        className="block truncate"
                                        title={display(value)}
                                      >
                                        {display(value)}
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        aria-label={`Inspect row ${index + 1} ${column.name} JSON`}
                                        className="block w-full max-w-96 truncate px-2 py-2 text-left hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                        title={display(value)}
                                        onClick={() =>
                                          onInspectJson({
                                            data,
                                            columnName: column.name,
                                            rowKey,
                                            rowNumber: index + 1,
                                          })
                                        }
                                      >
                                        {display(value)}
                                      </button>
                                    )}
                                  </TableCell>
                                );
                              })}
                              {actions !== undefined && (
                                <TableCell className="border-r">
                                  {actions(row, index + 1)}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </section>
          </Panel>
          {hasInspector && (
            <>
              <Separator
                id="inspector-separator"
                aria-label="Resize inspector"
                className={`z-20 bg-border transition-colors hover:bg-ring focus-visible:bg-ring focus-visible:outline-none active:bg-ring ${compact ? 'h-1 cursor-row-resize' : 'w-1 cursor-col-resize'}`}
              />
              <Panel
                id="inspector"
                className="min-h-0 min-w-0"
                defaultSize={compact ? '40%' : '35%'}
                minSize={compact ? '25%' : '20%'}
                maxSize={compact ? '70%' : '60%'}
              >
                {inspector}
              </Panel>
            </>
          )}
        </Group>
      </div>
    </main>
  );
}
