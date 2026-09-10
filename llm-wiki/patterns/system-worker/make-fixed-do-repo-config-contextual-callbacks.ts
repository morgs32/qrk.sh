import { Effect } from 'effect';

/**
 * Let `makeFixedDORepoConfig` context-type Repo wiring callbacks, and keep Durable Object lookup in the Repo's inherited `getRepo` static; supply namespaceBinding to makeFixedDORepo.
 *
 * @bad Put generic Durable Object lookup in `makeFixedDORepoConfig`.
 * @bad Restate route-derived `{ name, key, storage }` props on `dbConfig`.
 * @bad Call `VersionedAggregateRepo.fixedDORepoConfig.getRepo(...)`; call `yield* VersionedAggregateRepo.getRepo(...)`.
 */
export const aggregateFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: 'mataggrepo',
  repoType: 'VersionedAggregateRepo',
  namePattern: parseRoutePattern(
    '/:systemId/:aggregateId/:aggregateName/:aggregateVersion',
  ),
  managedRuntime,
  dbConfig: Effect.fn('VersionedAggregateRepo.dbConfig')(function* (props) {
    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: props.key.aggregateName,
      recordKind: 'aggregates',
    });
    return makeResourceDbConfig({ models: aggregate.models });
  }),
});

declare function makeFixedDORepoConfig(props: {
  abbreviation: string;
  repoType: string;
  namePattern: unknown;
  managedRuntime: unknown;
  dbConfig: (props: {
    name: string;
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
    };
    storage: DurableObjectStorage;
  }) => Effect.Effect<unknown>;
}): {
  nameUtils: {
    makeName(props: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
    }): Effect.Effect<string>;
  };
};
declare function parseRoutePattern(pattern: string): unknown;
declare const managedRuntime: unknown;
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
