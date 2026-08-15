import { Effect } from 'effect';

/**
 * Let `makeBoundDORepoConfig` context-type Repo wiring callbacks, and keep Durable Object lookup in the Repo's explicit `get*Repo` helper.
 *
 * @bad Put generic Durable Object lookup in `makeBoundDORepoConfig`; binding lookup belongs outside `boundDORepoConfig`.
 * @bad Restate route-derived `{ name, key, storage }` props on `getDbConfig`; let `makeBoundDORepoConfig` provide the callback type.
 * @bad Call `AggregateRepo.boundDORepoConfig.getRepo(...)`; call `yield* getAggregateRepo(...)`.
 */
export const aggregateBoundDORepoConfig = makeBoundDORepoConfig({
  abbreviation: 'acctrepo',
  namePattern: parseRoutePattern('/:generationId/:aggregateId/:aggregateName'),
  managedRuntime,
  getDbConfig: Effect.fn('AggregateRepo.getDbConfig')(function* (props) {
    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: props.key.aggregateName,
      recordKind: 'aggregates',
    });

    return makeResourceDbConfig({
      models: aggregate.models,
    });
  }),
});

export const getAggregateRepo = Effect.fn('getAggregateRepo')(
  function* (props: {
    key: {
      generationId: string;
      aggregateId: string;
      aggregateName: string;
    };
  }) {
    const name = yield* aggregateBoundDORepoConfig.nameUtils.makeName(
      props.key,
    );
    return env.AGGREGATE_REPO.getByName(name);
  },
);

export const useAggregateRepo = Effect.fn('useAggregateRepo')(function* () {
  const aggregateRepo = yield* getAggregateRepo({
    key: {
      generationId: 'gen_1',
      aggregateId: 'acct_1',
      aggregateName: 'shopper',
    },
  });

  yield* callAggregateRepo(aggregateRepo);
});

/**
 * @bad
 */
export const aggregateBoundDORepoConfigWithLookup = makeBoundDORepoConfig({
  abbreviation: 'acctrepo',
  namePattern: parseRoutePattern('/:generationId/:aggregateId/:aggregateName'),
  managedRuntime,
  getBinding: () => env.AGGREGATE_REPO,
  getDbConfig: Effect.fn('AggregateRepo.getDbConfig')(function* (props: {
    name: string;
    key: {
      generationId: string;
      aggregateId: string;
      aggregateName: string;
    };
    storage: DurableObjectStorage;
  }) {
    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: props.key.aggregateName,
      recordKind: 'aggregates',
    });
    return makeResourceDbConfig({ models: aggregate.models });
  }),
});

/**
 * @bad
 */
const aggregateRepoFromBoundDORepoConfig = aggregateBoundDORepoConfig.getRepo({
  key: {
    generationId: 'gen_1',
    aggregateId: 'acct_1',
    aggregateName: 'shopper',
  },
});
export const useBoundDORepoConfigLookup = Effect.fn(
  'useBoundDORepoConfigLookup',
)(function* () {
  yield* callAggregateRepo(aggregateRepoFromBoundDORepoConfig);
});

declare function makeBoundDORepoConfig(props: {
  abbreviation: string;
  namePattern: unknown;
  managedRuntime: unknown;
  getBinding?: () => unknown;
  getDbConfig: (props: {
    name: string;
    key: {
      generationId: string;
      aggregateId: string;
      aggregateName: string;
    };
    storage: DurableObjectStorage;
  }) => Effect.Effect<unknown>;
}): {
  nameUtils: {
    makeName(props: {
      generationId: string;
      aggregateId: string;
      aggregateName: string;
    }): Effect.Effect<string>;
  };
  getRepo(props: {
    key: {
      generationId: string;
      aggregateId: string;
      aggregateName: string;
    };
  }): unknown;
};
declare function parseRoutePattern(pattern: string): unknown;
declare const managedRuntime: unknown;
declare const env: {
  AGGREGATE_REPO: { getByName(name: string): unknown };
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
declare function callAggregateRepo(repo: unknown): Effect.Effect<void>;
