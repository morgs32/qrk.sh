import { Effect } from 'effect';

/**
 * Use `boundDORepoConfig` for static BoundDORepo metadata, and use explicit
 * `get*Repo` helpers for Durable Object stub lookup.
 *
 * @bad Do not call `AggregateFrontendRepo.boundDORepoConfig.getRepo(...)`; generic lookup does not live on `boundDORepoConfig`.
 * @bad Do not wrap `AggregateFrontendRepo` in `as unknown as` to recover helper typing for a one-off test call.
 * @bad Do not define local one-call `getRepo` shims when a same-named repo lookup helper exists.
 */
export const useAggregateFrontendRepo = Effect.fn('useAggregateFrontendRepo')(
  function* () {
    const key = {
      aggregateId: 'acct_1',
      aggregateName: 'shopper',
      userId: 'user_owner',
      frontendName: 'default',
    };

    const name =
      yield* AggregateFrontendRepo.boundDORepoConfig.nameUtils.makeName(key);
    const aggregateFrontendRepo = yield* getAggregateFrontendRepo({ key });

    yield* callAggregateFrontendRepo(aggregateFrontendRepo, name);
  },
);

/**
 * @bad
 */
export const useBoundDORepoConfigGetRepo = Effect.fn(
  'useBoundDORepoConfigGetRepo',
)(function* () {
  const aggregateFrontendRepo = AggregateFrontendRepo.boundDORepoConfig.getRepo(
    {
      key: {
        aggregateId: 'acct_1',
        aggregateName: 'shopper',
        userId: 'user_owner',
        frontendName: 'default',
      },
    },
  );

  yield* callAggregateFrontendRepo(
    aggregateFrontendRepo,
    'acct_1/shopper/user_owner',
  );
});

declare const AggregateFrontendRepo: {
  boundDORepoConfig: {
    nameUtils: {
      makeName(props: {
        aggregateId: string;
        aggregateName: string;
        userId: string;
        frontendName: string;
      }): Effect.Effect<string>;
    };
    getRepo(props: {
      key: {
        aggregateId: string;
        aggregateName: string;
        userId: string;
        frontendName: string;
      };
    }): unknown;
  };
};
declare function getAggregateFrontendRepo(props: {
  key: {
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
}): Effect.Effect<unknown>;
declare function callAggregateFrontendRepo(
  repo: unknown,
  name: string,
): Effect.Effect<void>;
