import { Effect } from 'effect';

/**
 * Let `makeFixedDORepoConfig` context-type Repo wiring callbacks, and keep Durable Object lookup in the Repo's explicit `get*Repo` helper.
 *
 * @bad Put generic Durable Object lookup in `makeFixedDORepoConfig`.
 * @bad Restate route-derived `{ name, key, storage }` props on `getDbConfig`.
 * @bad Call `MaterializedAggregateRepo.fixedDORepoConfig.getRepo(...)`; call `yield* getMaterializedAggregateRepo(...)`.
 */
export const materializedAggregateFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: 'mataggrepo',
  repoType: 'MaterializedAggregateRepo',
  namePattern: parseRoutePattern('/:systemId/:aggregateId/:aggregateName'),
  managedRuntime,
  getDbConfig: Effect.fn('MaterializedAggregateRepo.getDbConfig')(
    function* (props) {
      const aggregate = yield* getByKeyOrThrow({
        record: system.aggregates,
        key: props.key.aggregateName,
        recordKind: 'aggregates',
      });
      return makeResourceDbConfig({ models: aggregate.models });
    },
  ),
});

export const getMaterializedAggregateRepo = Effect.fn(
  'getMaterializedAggregateRepo',
)(function* (props: {
  key: { systemId: string; aggregateId: string; aggregateName: string };
}) {
  const name = yield* materializedAggregateFixedDORepoConfig.nameUtils.makeName(
    props.key,
  );
  return env.MATERIALIZED_AGGREGATE_REPO.getByName(name);
});

declare function makeFixedDORepoConfig(props: {
  abbreviation: string;
  repoType: string;
  namePattern: unknown;
  managedRuntime: unknown;
  getDbConfig: (props: {
    name: string;
    key: { systemId: string; aggregateId: string; aggregateName: string };
    storage: DurableObjectStorage;
  }) => Effect.Effect<unknown>;
}): {
  nameUtils: {
    makeName(props: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
    }): Effect.Effect<string>;
  };
};
declare function parseRoutePattern(pattern: string): unknown;
declare const managedRuntime: unknown;
declare const env: {
  MATERIALIZED_AGGREGATE_REPO: { getByName(name: string): unknown };
};
declare const system: {
  aggregates: Record<string, { models: Record<string, unknown> }>;
};
declare function getByKeyOrThrow<VALUE>(props: {
  record: Record<string, VALUE>;
  key: string;
  recordKind: string;
}): Effect.Effect<VALUE, unknown>;
declare function makeResourceDbConfig(props: {
  models: Record<string, unknown>;
}): unknown;
