import { useEffect, useState } from 'react';

import type {
  IRepoRegistration,
  IRepoTableData,
  IRepoType,
} from '@zerospin/core/system/types';
import { KeyIcon, RefreshCwIcon, XIcon } from 'lucide-react';
import { collapseAllNested, JsonView } from 'react-json-view-lite';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Link, useLocation, useNavigate } from 'react-router';

import { Button } from './components/ui/button.js';
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from './components/ui/combobox.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './components/ui/table.js';

const repoTypes = [
  'SystemRepo',
  'AccountRepo',
  'AuthorizationRepo',
  'ActorRepo',
  'FrontendRepo',
  'ServiceRepo',
  'AccountBlockRepo',
  'ActorBlockRepo',
  'FrontendBlockRepo',
  'ServiceBlockRepo',
  'SystemLogRepo',
] satisfies readonly IRepoType[];

export function RepoExplorer() {
  const location = useLocation();
  const navigate = useNavigate();
  const segments = location.pathname
    .split('/')
    .filter(segment => segment.length > 0)
    .map(segment => decodeURIComponent(segment));
  const repoType = repoTypes.find(candidate => candidate === segments[0]);
  const repoName = segments[1];
  const [registrations, setRegistrations] = useState<
    readonly IRepoRegistration[]
  >([]);
  const [search, setSearch] = useState('');
  const [selectedTableName, setSelectedTableName] = useState<string | null>(
    null,
  );
  const [tableData, setTableData] = useState<IRepoTableData | null>(null);
  const [registrationsError, setRegistrationsError] = useState<string | null>(
    null,
  );
  const [tableError, setTableError] = useState<string | null>(null);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isCompactLayout, setIsCompactLayout] = useState(
    () => window.matchMedia('(max-width: 1023px)').matches,
  );
  const [selectedJsonData, setSelectedJsonData] = useState<object | null>(null);
  const [selectedJsonColumnName, setSelectedJsonColumnName] = useState<
    string | null
  >(null);
  const [selectedJsonRowNumber, setSelectedJsonRowNumber] = useState<
    number | null
  >(null);

  useEffect(() => {
    // 1. Read the same Tailwind lg boundary used by the responsive panel layout.
    const compactLayoutQuery = window.matchMedia('(max-width: 1023px)');
    setIsCompactLayout(compactLayoutQuery.matches);

    // 2. Update only the orientation state when the browser crosses the boundary.
    const handleCompactLayoutChange = () => {
      setIsCompactLayout(compactLayoutQuery.matches);
    };
    compactLayoutQuery.addEventListener('change', handleCompactLayoutChange);

    // 3. Remove the exact listener registered by this RepoExplorer instance.
    return () => {
      compactLayoutQuery.removeEventListener(
        'change',
        handleCompactLayoutChange,
      );
    };
  }, []);

  useEffect(() => {
    if (repoType === undefined) {
      setRegistrations([]);
      return;
    }

    const abortController = new AbortController();
    setRegistrationsLoading(true);
    setRegistrationsError(null);
    fetch(`/api/repos/${encodeURIComponent(repoType)}`, {
      signal: abortController.signal,
    })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(
            typeof body.error === 'string'
              ? body.error
              : 'Failed to load repos',
          );
        }
        setRegistrations(body);
      })
      .catch(error => {
        if (!abortController.signal.aborted) {
          setRegistrationsError(
            error instanceof Error ? error.message : 'Failed to load repos',
          );
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setRegistrationsLoading(false);
        }
      });

    return () => abortController.abort();
  }, [repoType]);

  useEffect(() => {
    setSelectedTableName(null);
    setTableData(null);
    setTableError(null);
    setSelectedJsonData(null);
    setSelectedJsonColumnName(null);
    setSelectedJsonRowNumber(null);
  }, [repoName, repoType]);

  useEffect(() => {
    if (
      repoType === undefined ||
      repoName === undefined ||
      selectedTableName === null
    ) {
      setTableData(null);
      return;
    }

    const abortController = new AbortController();
    setTableLoading(true);
    setTableError(null);
    fetch(
      `/api/repos/${encodeURIComponent(repoType)}/${encodeURIComponent(repoName)}/${encodeURIComponent(selectedTableName)}`,
      { signal: abortController.signal },
    )
      .then(async response => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(
            typeof body.error === 'string'
              ? body.error
              : 'Failed to load table rows',
          );
        }
        setTableData(body);
      })
      .catch(error => {
        if (!abortController.signal.aborted) {
          setTableError(
            error instanceof Error
              ? error.message
              : 'Failed to load table rows',
          );
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setTableLoading(false);
        }
      });

    return () => abortController.abort();
  }, [refreshKey, repoName, repoType, selectedTableName]);

  if (segments.length === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16 font-mono">
        <div className="mb-6 flex gap-3">
          <span>1</span>
          <h1>Repos</h1>
        </div>
        <ol className="ml-10 list-[upper-alpha] space-y-1 pl-5">
          {repoTypes.map(repoTypeOption => (
            <li key={repoTypeOption} className="marker:text-muted-foreground">
              <Link
                className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                to={`/${repoTypeOption}`}
              >
                {repoTypeOption}
              </Link>
            </li>
          ))}
        </ol>
      </main>
    );
  }

  if (repoType === undefined || segments.length > 2) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm text-destructive">Repo route not found.</p>
        <Link className="mt-4 inline-block underline" to="/">
          Back to repos
        </Link>
      </main>
    );
  }

  if (repoName === undefined) {
    const normalizedSearch = search.trim().toLowerCase();
    const filteredRegistrations = registrations.filter(registration =>
      registration.repoName.toLowerCase().includes(normalizedSearch),
    );

    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="mb-8">
          <Link
            className="text-sm text-muted-foreground hover:text-foreground"
            to="/"
          >
            Repos
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {repoType}
          </h1>
        </div>

        <Combobox<IRepoRegistration>
          items={registrations}
          itemToStringLabel={registration => registration.repoName}
          itemToStringValue={registration => registration.repoName}
          onInputValueChange={setSearch}
          onValueChange={registration => {
            if (registration !== null) {
              navigate(
                `/${repoType}/${encodeURIComponent(registration.repoName)}`,
              );
            }
          }}
        >
          <ComboboxInput
            aria-label={`Search ${repoType} names`}
            placeholder={`Search ${repoType} by name`}
          />
          <ComboboxContent>
            <ComboboxEmpty>No repos found.</ComboboxEmpty>
            <ComboboxList>
              <ComboboxGroup items={registrations}>
                <ComboboxLabel>{repoType}</ComboboxLabel>
                <ComboboxCollection>
                  {(registration: IRepoRegistration) => (
                    <ComboboxItem
                      key={registration.repoName}
                      value={registration}
                    >
                      {registration.repoName}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>

        {registrationsError !== null ? (
          <p className="mt-4 text-sm text-destructive">{registrationsError}</p>
        ) : null}

        <div className="mt-6 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-32 text-right">Tables</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrationsLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Loading repos…
                  </TableCell>
                </TableRow>
              ) : null}
              {!registrationsLoading && filteredRegistrations.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No repos found.
                  </TableCell>
                </TableRow>
              ) : null}
              {filteredRegistrations.map(registration => (
                <TableRow key={registration.repoName}>
                  <TableCell className="font-mono">
                    <Link
                      className="underline-offset-4 hover:underline"
                      to={`/${repoType}/${encodeURIComponent(registration.repoName)}`}
                    >
                      {registration.repoName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {registration.tableNames.length}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </main>
    );
  }

  const registration = registrations.find(
    candidate => candidate.repoName === repoName,
  );

  return (
    <main className="flex h-screen min-w-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm">
        <Link className="text-muted-foreground hover:text-foreground" to="/">
          Repos
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link
          className="text-muted-foreground hover:text-foreground"
          to={`/${repoType}`}
        >
          {repoType}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="min-w-0 truncate font-mono">{repoName}</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r">
          <div className="border-b px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Tables
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {registrationsLoading ? (
              <p className="px-4 py-2 text-sm text-muted-foreground">
                Loading…
              </p>
            ) : null}
            {!registrationsLoading && registration === undefined ? (
              <p className="px-4 py-2 text-sm text-destructive">
                Repo is not registered.
              </p>
            ) : null}
            {registration?.tableNames.map(tableName => (
              <button
                key={tableName}
                type="button"
                data-table-name={tableName}
                className={`flex w-full px-4 py-2 text-left font-mono text-sm transition-colors ${
                  selectedTableName === tableName
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted'
                }`}
                onClick={() => {
                  setSelectedTableName(tableName);
                  setSelectedJsonData(null);
                  setSelectedJsonColumnName(null);
                  setSelectedJsonRowNumber(null);
                }}
              >
                {tableName}
              </button>
            ))}
          </div>
        </aside>
        <Group
          key={`${isCompactLayout ? 'compact' : 'desktop'}-${
            selectedJsonData === null ? 'table-only' : 'with-inspector'
          }`}
          id="repo-table-and-json-inspector"
          className="min-h-0 min-w-0 flex-1"
          orientation={isCompactLayout ? 'vertical' : 'horizontal'}
        >
          <Panel
            id="repo-table"
            className="min-h-0 min-w-0"
            defaultSize={
              selectedJsonData === null
                ? '100%'
                : isCompactLayout
                  ? '60%'
                  : '65%'
            }
            minSize={isCompactLayout ? '30%' : '40%'}
          >
            <section className="flex h-full min-h-0 min-w-0 flex-col">
              {selectedTableName === null ? (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  Select a table from the sidebar.
                </div>
              ) : (
                <>
                  <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
                    <h2 className="font-mono text-sm font-medium">
                      {selectedTableName}
                    </h2>
                    <Button
                      aria-label="Refresh table"
                      className="ml-auto"
                      variant="outline"
                      size="icon-sm"
                      disabled={tableLoading}
                      onClick={() => {
                        setSelectedJsonData(null);
                        setSelectedJsonColumnName(null);
                        setSelectedJsonRowNumber(null);
                        setRefreshKey(current => current + 1);
                      }}
                    >
                      <RefreshCwIcon
                        className={tableLoading ? 'animate-spin' : undefined}
                      />
                      <span className="sr-only">Refresh table</span>
                    </Button>
                  </div>
                  {tableError !== null ? (
                    <p className="border-b px-4 py-3 text-sm text-destructive">
                      {tableError}
                    </p>
                  ) : null}
                  <div className="min-h-0 flex-1 overflow-auto">
                    <Table className="min-w-max">
                      <TableHeader className="sticky top-0 z-10 bg-background">
                        <TableRow>
                          <TableHead className="w-12 border-r text-center text-muted-foreground">
                            #
                          </TableHead>
                          {tableData?.columns.map(column => (
                            <TableHead
                              key={column.name}
                              className="border-r font-mono"
                            >
                              <span className="flex items-center gap-2">
                                {column.isPrimaryKey ? (
                                  <KeyIcon className="size-3.5 text-amber-600" />
                                ) : null}
                                {column.name}
                                <span className="text-xs font-normal text-muted-foreground">
                                  {column.type}
                                </span>
                              </span>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableLoading && tableData === null ? (
                          <TableRow>
                            <TableCell className="h-24 text-center text-muted-foreground">
                              Loading rows…
                            </TableCell>
                          </TableRow>
                        ) : null}
                        {!tableLoading && tableData?.rows.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={(tableData?.columns.length ?? 0) + 1}
                              className="h-24 text-center text-muted-foreground"
                            >
                              No rows.
                            </TableCell>
                          </TableRow>
                        ) : null}
                        {tableData?.rows.map((row, rowIndex) => (
                          <TableRow key={rowIndex}>
                            <TableCell className="border-r text-center text-muted-foreground">
                              {rowIndex + 1}
                            </TableCell>
                            {tableData.columns.map(column => {
                              const value = row[column.name];
                              let jsonData: object | null = null;

                              if (value !== null && typeof value === 'object') {
                                jsonData = value;
                              } else if (typeof value === 'string') {
                                try {
                                  const parsedValue: unknown =
                                    JSON.parse(value);
                                  if (
                                    parsedValue !== null &&
                                    typeof parsedValue === 'object'
                                  ) {
                                    jsonData = parsedValue;
                                  }
                                } catch {
                                  // Invalid JSON remains ordinary truncated table text.
                                }
                              }

                              const isSelectedJsonCell =
                                jsonData !== null &&
                                selectedJsonColumnName === column.name &&
                                selectedJsonRowNumber === rowIndex + 1;
                              const displayValue =
                                value === null
                                  ? 'NULL'
                                  : typeof value === 'object'
                                    ? JSON.stringify(value)
                                    : String(value);

                              return (
                                <TableCell
                                  key={column.name}
                                  data-state={
                                    isSelectedJsonCell ? 'selected' : undefined
                                  }
                                  className={`max-w-96 border-r font-mono ${
                                    jsonData === null ? '' : 'p-0'
                                  } ${
                                    isSelectedJsonCell
                                      ? 'bg-accent ring-1 ring-inset ring-ring'
                                      : ''
                                  }`}
                                >
                                  {jsonData === null ? (
                                    <span
                                      className="block truncate"
                                      title={String(value)}
                                    >
                                      {displayValue}
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      aria-label={`Inspect row ${rowIndex + 1} ${column.name} JSON`}
                                      className="block w-full max-w-96 truncate px-2 py-2 text-left hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                      title={String(value)}
                                      onClick={() => {
                                        setSelectedJsonData(jsonData);
                                        setSelectedJsonColumnName(column.name);
                                        setSelectedJsonRowNumber(rowIndex + 1);
                                      }}
                                    >
                                      {displayValue}
                                    </button>
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </section>
          </Panel>
          {selectedJsonData !== null ? (
            <Separator
              id="json-inspector-separator"
              aria-label="Resize JSON inspector"
              className={`z-20 bg-border transition-colors hover:bg-ring focus-visible:bg-ring focus-visible:outline-none active:bg-ring ${
                isCompactLayout
                  ? 'h-1 cursor-row-resize'
                  : 'w-1 cursor-col-resize'
              }`}
            />
          ) : null}
          {selectedJsonData !== null ? (
            <Panel
              id="json-inspector"
              className="min-h-0 min-w-0"
              defaultSize={isCompactLayout ? '40%' : '35%'}
              minSize={isCompactLayout ? '25%' : '20%'}
              maxSize={isCompactLayout ? '70%' : '60%'}
            >
              <aside className="flex h-full min-h-0 flex-col bg-background">
                <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
                  <h2 className="min-w-0 truncate font-mono text-sm font-medium">
                    {selectedJsonColumnName}
                  </h2>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Row {selectedJsonRowNumber}
                  </span>
                  <Button
                    aria-label="Close JSON inspector"
                    className="ml-auto"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setSelectedJsonData(null);
                      setSelectedJsonColumnName(null);
                      setSelectedJsonRowNumber(null);
                    }}
                  >
                    <XIcon />
                    <span className="sr-only">Close JSON inspector</span>
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4 font-mono text-sm">
                  <JsonView
                    aria-label={`JSON for row ${selectedJsonRowNumber} ${selectedJsonColumnName}`}
                    clickToExpandNode
                    data={selectedJsonData}
                    shouldExpandNode={collapseAllNested}
                  />
                </div>
              </aside>
            </Panel>
          ) : null}
        </Group>
      </div>
    </main>
  );
}
