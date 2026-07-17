import type { IWaSqliteClient } from "@zerospin/core/drizzle/types";
import { is, SQL, Subquery } from "drizzle-orm";
import {
  getTableConfig,
  getViewConfig,
  SQLiteTable,
  SQLiteView,
} from "drizzle-orm/sqlite-core";
import { createStore } from "zustand/vanilla";

interface IInternalRelationalQuery {
  config?: unknown;
  mode?: string;
  schema?: Record<string, unknown>;
  table?: unknown;
  tableConfig?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function getInternalRelationalQuery(
  query: unknown,
): IInternalRelationalQuery | null {
  if (!isRecord(query)) {
    return null;
  }

  return query;
}

function getRelationMap(tableConfig: unknown): Record<string, unknown> | null {
  if (
    !isRecord(tableConfig) ||
    !("relations" in tableConfig) ||
    !isRecord(tableConfig.relations)
  ) {
    return null;
  }

  return tableConfig.relations;
}

function collectTableNameFromEntity(props: {
  entity: unknown;
  tableNames: Set<string>;
}) {
  const { entity, tableNames } = props;

  if (is(entity, SQLiteTable)) {
    tableNames.add(getTableConfig(entity).name);
    return;
  }

  if (is(entity, SQLiteView)) {
    tableNames.add(getViewConfig(entity).name);
  }
}

function collectRelationsV2WhereTableNames(props: {
  filter: unknown;
  schema: Record<string, unknown>;
  tableConfig: unknown;
  tableNames: Set<string>;
}) {
  const { filter, schema, tableConfig, tableNames } = props;

  if (typeof filter !== "object" || filter === null) {
    return;
  }

  if (Array.isArray(filter)) {
    for (const item of filter) {
      collectRelationsV2WhereTableNames({
        filter: item,
        schema,
        tableConfig,
        tableNames,
      });
    }
    return;
  }

  const relationMap = getRelationMap(tableConfig);
  if (relationMap === null) {
    return;
  }

  for (const [key, value] of Object.entries(filter)) {
    if (key === "AND" || key === "OR" || key === "NOT") {
      collectRelationsV2WhereTableNames({
        filter: value,
        schema,
        tableConfig,
        tableNames,
      });
      continue;
    }

    if (key === "RAW") {
      continue;
    }

    if (!(key in relationMap)) {
      continue;
    }

    const relation = relationMap[key];
    if (typeof relation !== "object" || relation === null) {
      continue;
    }

    if ("targetTable" in relation) {
      collectTableNameFromEntity({
        entity: relation.targetTable,
        tableNames,
      });
    }

    if ("throughTable" in relation) {
      collectTableNameFromEntity({
        entity: relation.throughTable,
        tableNames,
      });
    }

    const nextTableConfig =
      "targetTableName" in relation &&
      typeof relation.targetTableName === "string" &&
      relation.targetTableName in schema
        ? schema[relation.targetTableName]
        : null;

    if (nextTableConfig === null) {
      continue;
    }

    collectRelationsV2WhereTableNames({
      filter: value,
      schema,
      tableConfig: nextTableConfig,
      tableNames,
    });
  }
}

function collectRelationsV2TableNames(props: {
  config: unknown;
  schema: Record<string, unknown>;
  tableConfig: unknown;
  tableNames: Set<string>;
}) {
  const { config, schema, tableConfig, tableNames } = props;

  if (typeof config !== "object" || config === null) {
    return;
  }

  if ("where" in config) {
    collectRelationsV2WhereTableNames({
      filter: config.where,
      schema,
      tableConfig,
      tableNames,
    });
  }

  if (
    !("with" in config) ||
    typeof config.with !== "object" ||
    config.with === null
  ) {
    return;
  }

  const relationMap = getRelationMap(tableConfig);
  if (relationMap === null) {
    return;
  }

  for (const [relationKey, relationConfig] of Object.entries(config.with)) {
    if (!relationConfig || !(relationKey in relationMap)) {
      continue;
    }

    const relation = relationMap[relationKey];
    if (typeof relation !== "object" || relation === null) {
      continue;
    }

    if ("targetTable" in relation) {
      collectTableNameFromEntity({
        entity: relation.targetTable,
        tableNames,
      });
    }

    if ("throughTable" in relation) {
      collectTableNameFromEntity({
        entity: relation.throughTable,
        tableNames,
      });
    }

    const nextTableConfig =
      "targetTableName" in relation &&
      typeof relation.targetTableName === "string" &&
      relation.targetTableName in schema
        ? schema[relation.targetTableName]
        : null;

    if (nextTableConfig === null) {
      continue;
    }

    collectRelationsV2TableNames({
      config: relationConfig,
      schema,
      tableConfig: nextTableConfig,
      tableNames,
    });
  }
}

function getWatchedTableNames(props: {
  query: unknown;
  /** Explicit tables to watch when inference cannot; empty means infer-only. */
  tableNames: readonly string[];
}) {
  const { query, tableNames } = props;
  const internalQuery = getInternalRelationalQuery(query);
  if (internalQuery?.table !== undefined) {
    const inferredTableNames = new Set<string>();

    collectTableNameFromEntity({
      entity: internalQuery.table,
      tableNames: inferredTableNames,
    });

    if (
      internalQuery.schema !== undefined &&
      internalQuery.tableConfig !== undefined
    ) {
      collectRelationsV2TableNames({
        config: internalQuery.config,
        schema: internalQuery.schema,
        tableConfig: internalQuery.tableConfig,
        tableNames: inferredTableNames,
      });
    }

    if (inferredTableNames.size > 0) {
      return [...inferredTableNames];
    }
  }

  const config =
    isRecord(query) && isRecord(query.config) ? query.config : undefined;
  const entity = config?.table;
  if (is(entity, Subquery) || is(entity, SQL)) {
    if (tableNames.length > 0) {
      return [...tableNames];
    }

    throw new Error(
      "Selecting from subqueries and SQL requires explicit tableNames in useLiveQuery.",
    );
  }

  const inferredTableNames = new Set<string>();
  collectTableNameFromEntity({
    entity,
    tableNames: inferredTableNames,
  });

  if (inferredTableNames.size > 0) {
    return [...inferredTableNames];
  }

  if (tableNames.length > 0) {
    return [...tableNames];
  }

  throw new Error("Could not infer watched tables for useLiveQuery.");
}

/*
 * 1. Execute the synchronous query once to seed the vanilla result store.
 * 2. Infer or validate the tables watched by this query when subscribed.
 * 3. Rerun once for each relevant committed table-change batch.
 * 4. Record rerun failures without discarding the last successful data.
 * 5. Release the shared database listener when the consumer unsubscribes.
 */
export function makeLiveQuery<RESULT>(props: {
  client: IWaSqliteClient;
  query: {
    readonly _: { readonly result: RESULT };
  } & ({ all(): RESULT } | { sync(): RESULT });
  tableNames: readonly string[];
}) {
  const { client, query, tableNames } = props;

  // 1 — initial data remains synchronous, matching the existing React hook contract.
  let initialData: RESULT;
  if ("all" in query && typeof query.all === "function") {
    initialData = query.all();
  } else if ("sync" in query && typeof query.sync === "function") {
    initialData = query.sync();
  } else {
    throw new Error("useLiveQuery requires a sync Drizzle query.");
  }

  const store = createStore<{
    data: RESULT;
    error: Error | undefined;
    updatedAt: Date | undefined;
  }>()(() => ({
    data: initialData,
    error: undefined,
    updatedAt: undefined,
  }));

  const subscribe = () => {
    let isCancelled = false;

    // 2 — inference failures are observable query state, not subscription throws.
    let watchedTableNames: ReadonlyArray<string>;
    try {
      watchedTableNames = getWatchedTableNames({ query, tableNames });
    } catch (error) {
      store.setState({ error: toError(error) });
      return () => {
        /* no database listener was installed */
      };
    }

    const watchedTableNameSet = new Set(watchedTableNames);

    const runQuery = () => {
      if (isCancelled) {
        return;
      }

      try {
        // 3 — each accepted notification executes the already-built query.
        if ("all" in query && typeof query.all === "function") {
          store.setState({
            data: query.all(),
            error: undefined,
            updatedAt: new Date(),
          });
          return;
        }

        if ("sync" in query && typeof query.sync === "function") {
          store.setState({
            data: query.sync(),
            error: undefined,
            updatedAt: new Date(),
          });
          return;
        }

        throw new Error("useLiveQuery requires a sync Drizzle query.");
      } catch (error) {
        // 4 — preserve the last successful data and timestamp on rerun failure.
        store.setState({ error: toError(error) });
      }
    };

    runQuery();

    const unsubscribeFromDatabase = client.subscribeToTableChanges(
      (changedTableNames) => {
        // One transaction can change several tables watched by this query. Find
        // the first relevant name, rerun once against final committed state,
        // and stop examining the rest of the batch.
        for (const watchedTableName of watchedTableNameSet) {
          if (changedTableNames.has(watchedTableName)) {
            runQuery();
            return;
          }
        }
      },
    );

    // 5 — React wrappers return this directly from their effect.
    return () => {
      isCancelled = true;
      unsubscribeFromDatabase();
    };
  };

  return {
    store,
    subscribe,
  };
}
