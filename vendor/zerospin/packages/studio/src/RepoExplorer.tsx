import { useEffect, useState } from 'react';

import type {
  IRepoRegistration,
  IRepoTableData,
  IRepoType,
  ISystemSpec,
} from '@zerospin/core/system/types';
import { Link, useLocation, useNavigate } from 'react-router';

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
import { StudioHome } from './StudioHome.js';
import { JsonInspector, TableBrowser, type IJsonCell } from './TableBrowser.js';

const repoTypes = [
  'SystemRepo',
  'AggregateVersionRepo',
  'AggregateActorVersionRepo',
  'ServiceActorVersionRepo',
  'ServiceVersionRepo',
  'AggregateChain',
  'AggregateVersionChain',
  'ServiceVersionChain',
  'AggregateActorVersionChain',
  'ServiceActorVersionChain',
  'ServiceChain',
  'SystemLogRepo',
] satisfies readonly IRepoType[];

export function RepoExplorer() {
  const systemSpec: ISystemSpec = JSON.parse(
    import.meta.env.ZEROSPIN_SYSTEM_SPEC,
  );
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
  const [selectedJsonCell, setSelectedJsonCell] = useState<IJsonCell | null>(
    null,
  );

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
    setSelectedJsonCell(null);
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
    return <StudioHome systemSpec={systemSpec} repoTypes={repoTypes} />;
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
            triggerLabel={`Open ${repoType} search`}
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
    <TableBrowser
      breadcrumbs={
        <>
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
        </>
      }
      sidebarLabel="Tables"
      names={registration?.tableNames ?? []}
      selectedName={selectedTableName}
      onSelect={name => {
        setSelectedTableName(name);
        setSelectedJsonCell(null);
      }}
      sidebarStatus={
        registrationsLoading ? (
          <p className="px-4 py-2 text-sm text-muted-foreground">Loading…</p>
        ) : registration === undefined ? (
          <p className="px-4 py-2 text-sm text-destructive">
            Repo is not registered.
          </p>
        ) : null
      }
      columns={tableData?.columns ?? []}
      rows={tableData?.rows ?? []}
      loading={tableLoading}
      error={tableError}
      onRefresh={() => {
        setSelectedJsonCell(null);
        setRefreshKey(current => current + 1);
      }}
      selectedJsonCell={selectedJsonCell}
      onInspectJson={setSelectedJsonCell}
      inspector={
        selectedJsonCell !== null ? (
          <JsonInspector
            cell={selectedJsonCell}
            onClose={() => setSelectedJsonCell(null)}
          />
        ) : null
      }
    />
  );
}
