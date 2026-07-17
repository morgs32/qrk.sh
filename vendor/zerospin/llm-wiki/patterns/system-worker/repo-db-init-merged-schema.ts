/**
 * Pass the owning models and tables to DB config factories so they derive one schema-and-relations graph.
 *
 * @bad Do not use `makeDbDefinition` indirection instead of passing the owning models and tables directly.
 * @bad Do not build `{ schema, relations }` manually instead of passing the owning table graph to `makeDbConfig`.
 */
export function getActorRepoDbConfig(props: {
  models: Record<string, unknown>;
  actorRepoTables: Record<string, unknown>;
}) {
  return makeResourceDbConfig({
    models: props.models,
    otherTables: props.actorRepoTables,
  });
}

export function getSystemRepoDbConfig(props: {
  systemRepoTables: Record<string, unknown>;
}) {
  return makeDbConfig({ tables: props.systemRepoTables });
}

declare function makeDbConfig(props: {
  tables: Record<string, unknown>;
}): unknown;
declare function makeResourceDbConfig(props: {
  models: Record<string, unknown>;
  otherTables: Record<string, unknown>;
}): unknown;
