import { Effect } from 'effect';

/**
 * Use `fixedDORepoConfig` for static Repo metadata and an explicit `get*Repo` helper for Durable Object stub lookup.
 *
 * @bad Call `MaterializedAggregateFrontendRepo.fixedDORepoConfig.getRepo(...)`.
 * @bad Cast the Repo class to recover helper typing for a one-off test call.
 * @bad Define a local one-call lookup shim when the same-named Repo helper exists.
 */
export const useMaterializedAggregateFrontendRepo = Effect.fn(
  'useMaterializedAggregateFrontendRepo',
)(function* () {
  const key = {
    systemId: 'sys_1',
    aggregateId: 'acct_1',
    aggregateName: 'shopper',
    userId: 'user_owner',
    frontendName: 'default',
  };
  const name =
    yield* MaterializedAggregateFrontendRepo.fixedDORepoConfig.nameUtils.makeName(
      key,
    );
  const repo = yield* getMaterializedAggregateFrontendRepo({ key });
  yield* callMaterializedAggregateFrontendRepo(repo, name);
});

declare const MaterializedAggregateFrontendRepo: {
  fixedDORepoConfig: {
    nameUtils: {
      makeName(props: {
        systemId: string;
        aggregateId: string;
        aggregateName: string;
        userId: string;
        frontendName: string;
      }): Effect.Effect<string>;
    };
  };
};
declare function getMaterializedAggregateFrontendRepo(props: {
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
}): Effect.Effect<unknown>;
declare function callMaterializedAggregateFrontendRepo(
  repo: unknown,
  name: string,
): Effect.Effect<void>;
