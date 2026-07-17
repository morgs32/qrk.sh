import { getInitializedStateOrThrow } from "@zerospin/core/session/getInitializedStateOrThrow";
import type { ISession } from "@zerospin/core/session/types";

import { useLiveQueryOnDb } from "../../../../useLiveQueryOnDb";

import { sessionsDatabaseTabStyles } from "./sessionsDatabaseTabStyles";

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function orderedColumnKeys(keySet: ReadonlySet<string>): string[] {
  const rest = [...keySet].filter((k) => k !== "id").sort();
  return keySet.has("id") ? ["id", ...rest] : rest;
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

export function SessionsDatabaseModelRowsTable(props: {
  readonly session: ISession;
  readonly modelKey: string;
}) {
  const { session, modelKey } = props;

  const { db } = getInitializedStateOrThrow({ session });

  const { data, error, updatedAt } = useLiveQueryOnDb({
    db,
    deps: [modelKey],
    query: (db) => {
      const modelQuery = db.query[modelKey];
      if (modelQuery === undefined) {
        throw new Error(`Unknown model key: ${modelKey}`);
      }
      return modelQuery.findMany({});
    },
    tableNames: [],
  });

  if (error !== undefined) {
    return (
      <p style={sessionsDatabaseTabStyles.errorText}>
        Failed to load rows: {error.message}
      </p>
    );
  }

  const rows = Array.isArray(data)
    ? (data as readonly Readonly<Record<string, unknown>>[])
    : [];

  if (updatedAt === undefined && rows.length === 0) {
    return <p style={{ margin: 0, fontSize: "0.85rem" }}>Loading rows…</p>;
  }

  const models = session.frontend.models ?? {};
  const model = models[modelKey];
  if (model === undefined) {
    return (
      <p style={{ margin: 0, fontSize: "0.85rem" }}>
        Unknown model key: {modelKey}
      </p>
    );
  }

  const columns =
    rows.length > 0
      ? computeColumnsFromRows(rows)
      : computeColumnsFromModelProperties(model.attributes);

  return (
    <table style={sessionsDatabaseTabStyles.table}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col} style={sessionsDatabaseTabStyles.tableTh}>
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIdx) => (
          <tr key={String(row.id ?? rowIdx)}>
            {columns.map((col) => (
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
