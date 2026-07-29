import { useSyncExternalStore } from 'react';

import { getInitializedStateOrThrow } from '@zerospin/core/session/getInitializedStateOrThrow';
import type { ISession } from '@zerospin/core/session/types';

import type { IDevtoolsServiceSessionEntry } from '../../../../types.js';
import { useLiveQueryOnDb } from '../../../../useLiveQueryOnDb';
import { useAccountSession, useServiceSession } from '../useSession';

import { sessionsDatabaseTabStyles } from './sessionsDatabaseTabStyles';

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function orderedColumnKeys(keySet: ReadonlySet<string>): string[] {
  const rest = [...keySet].filter(k => k !== 'id').sort();
  return keySet.has('id') ? ['id', ...rest] : rest;
}

function computeColumnsFromRows(
  rows: readonly Readonly<Record<string, unknown>>[],
): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      keys.add(key);
    }
  }
  return orderedColumnKeys(keys);
}

function computeColumnsFromModelProperties(
  properties: Readonly<Record<string, unknown>>,
): string[] {
  return orderedColumnKeys(new Set(Object.keys(properties)));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function DatabaseRowsTable(props: {
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly modelAttributes: Readonly<Record<string, unknown>> | undefined;
  readonly modelKey: string;
  readonly error: Error | undefined;
  readonly isLoading: boolean;
}) {
  const { rows, modelAttributes, modelKey, error, isLoading } = props;

  if (error !== undefined) {
    return (
      <p style={sessionsDatabaseTabStyles.errorText}>
        Failed to load rows: {error.message}
      </p>
    );
  }

  if (isLoading && rows.length === 0) {
    return <p style={{ margin: 0, fontSize: '0.85rem' }}>Loading rows…</p>;
  }

  if (modelAttributes === undefined) {
    return (
      <p style={{ margin: 0, fontSize: '0.85rem' }}>
        Unknown model key: {modelKey}
      </p>
    );
  }

  const columns =
    rows.length > 0
      ? computeColumnsFromRows(rows)
      : computeColumnsFromModelProperties(modelAttributes);

  return (
    <table style={sessionsDatabaseTabStyles.table}>
      <thead>
        <tr>
          {columns.map(col => (
            <th key={col} style={sessionsDatabaseTabStyles.tableTh}>
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIdx) => (
          <tr key={String(row.id ?? rowIdx)}>
            {columns.map(col => (
              <td key={col} style={sessionsDatabaseTabStyles.tableTd}>
                {formatCellValue(row[col])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AccountDatabaseRowsTable(props: {
  readonly session: ISession;
  readonly modelKey: string;
}) {
  const { session, modelKey } = props;
  const { db, models } = getInitializedStateOrThrow({ session });
  const { data, error, updatedAt } = useLiveQueryOnDb({
    db,
    deps: [modelKey],
    query: db => {
      const modelQuery = db.query[modelKey];
      if (modelQuery === undefined) {
        throw new Error(`Unknown model key: ${modelKey}`);
      }
      return modelQuery.findMany({});
    },
    tableNames: [],
  });
  const rows = Array.isArray(data) ? data.filter(isRecord) : [];

  return (
    <DatabaseRowsTable
      rows={rows}
      modelAttributes={models[modelKey]?.attributes}
      modelKey={modelKey}
      error={error}
      isLoading={updatedAt === undefined}
    />
  );
}

function ServiceDatabaseRowsTable(props: {
  readonly session: IDevtoolsServiceSessionEntry;
  readonly modelKey: string;
}) {
  const { session, modelKey } = props;
  const isInitialized = useSyncExternalStore(
    session.subscribe,
    session.getIsInitialized,
    session.getIsInitialized,
  );
  const frontendIndex = useSyncExternalStore(
    session.subscribe,
    session.getFrontendIndex,
    session.getFrontendIndex,
  );

  if (!isInitialized) {
    return <p style={{ margin: 0, fontSize: '0.85rem' }}>Loading rows…</p>;
  }

  let rows: readonly Readonly<Record<string, unknown>>[] = [];
  let error: Error | undefined;

  try {
    // The subscribed frontend index makes each committed service block rerun
    // the typed query closure retained by the registration adapter.
    void frontendIndex;
    const result = session.readModelRows(modelKey);
    rows = Array.isArray(result) ? result.filter(isRecord) : [];
  } catch (cause) {
    error = cause instanceof Error ? cause : new Error(String(cause));
  }

  return (
    <DatabaseRowsTable
      rows={rows}
      modelAttributes={session.getModelAttributes(modelKey)}
      modelKey={modelKey}
      error={error}
      isLoading={false}
    />
  );
}

export function SessionsDatabaseModelRowsTable(props: {
  readonly modelKey: string;
}) {
  const { modelKey } = props;
  const accountSession = useAccountSession();
  const serviceSession = useServiceSession();

  if (accountSession !== undefined) {
    return (
      <AccountDatabaseRowsTable session={accountSession} modelKey={modelKey} />
    );
  }

  if (serviceSession !== undefined) {
    return (
      <ServiceDatabaseRowsTable session={serviceSession} modelKey={modelKey} />
    );
  }

  return null;
}
