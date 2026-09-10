import { Effect } from 'effect';

/**
 * Use `fixedDORepoConfig` for static Repo metadata and the inherited `Repo.getRepo` static for Durable Object stub lookup.
 *
 * @bad Call `UserVersionedAggregateRepo.fixedDORepoConfig.getRepo(...)`.
 * @bad Cast the Repo class to recover helper typing for a one-off test call.
 * @bad Define a local one-call lookup shim around the inherited static lookup.
 */
export const useUserVersionedAggregateRepo = Effect.fn(
  'useUserVersionedAggregateRepo',
)(function* () {
  const key = {
    systemId: 'sys_1',
    aggregateId: 'acct_1',
    aggregateName: 'shopper',
    aggregateVersion: '1.0.0',
    userId: 'user_owner',
    frontendName: 'default',
  };
  const name =
    yield* UserVersionedAggregateRepo.fixedDORepoConfig.nameUtils.makeName(key);
  const repo = yield* UserVersionedAggregateRepo.getRepo({
    key,
  });
  yield* callUserVersionedAggregateRepo(repo, name);
});

declare const UserVersionedAggregateRepo: {
  getRepo(props: {
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
      userId: string;
      frontendName: string;
    };
  }): Effect.Effect<unknown>;
  fixedDORepoConfig: {
    nameUtils: {
      makeName(props: {
        systemId: string;
        aggregateId: string;
        aggregateName: string;
        aggregateVersion: string;
        userId: string;
        frontendName: string;
      }): Effect.Effect<string>;
    };
  };
};
declare function callUserVersionedAggregateRepo(
  repo: unknown,
  name: string,
): Effect.Effect<void>;
