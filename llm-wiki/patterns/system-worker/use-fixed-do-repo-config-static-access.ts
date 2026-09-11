import { Effect } from 'effect';

/**
 * Use `fixedDORepoConfig` for static Repo metadata and the inherited `Repo.getRepo` static for Durable Object stub lookup.
 *
 * @bad Call `AuthenticatedVersionedAggregateRepo.fixedDORepoConfig.getRepo(...)`.
 * @bad Cast the Repo class to recover helper typing for a one-off test call.
 * @bad Define a local one-call lookup shim around the inherited static lookup.
 */
export const useAuthenticatedVersionedAggregateRepo = Effect.fn(
  'useAuthenticatedVersionedAggregateRepo',
)(function* () {
  const key = {
    systemId: 'sys_1',
    aggregateId: 'acct_1',
    aggregateName: 'shopper',
    aggregateVersion: '1.0.0',
    selectionPath: '/user_owner',
    frontendName: 'default',
  };
  const name =
    yield* AuthenticatedVersionedAggregateRepo.fixedDORepoConfig.nameUtils.makeName(
      key,
    );
  const repo = yield* AuthenticatedVersionedAggregateRepo.getRepo({
    key,
  });
  yield* callAuthenticatedVersionedAggregateRepo(repo, name);
});

declare const AuthenticatedVersionedAggregateRepo: {
  getRepo(props: {
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
      selectionPath: string;
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
        selectionPath: string;
        frontendName: string;
      }): Effect.Effect<string>;
    };
  };
};
declare function callAuthenticatedVersionedAggregateRepo(
  repo: unknown,
  name: string,
): Effect.Effect<void>;
