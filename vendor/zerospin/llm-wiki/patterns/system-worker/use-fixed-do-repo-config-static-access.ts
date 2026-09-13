import { Effect } from 'effect';

/**
 * Use `fixedDORepoConfig` for static Repo metadata and the inherited `Repo.getRepo` static for Durable Object stub lookup.
 *
 * @bad Call `SelectionVersionedAggregateRepo.fixedDORepoConfig.getRepo(...)`.
 * @bad Cast the Repo class to recover helper typing for a one-off test call.
 * @bad Define a local one-call lookup shim around the inherited static lookup.
 */
export const useSelectionVersionedAggregateRepo = Effect.fn(
  'useSelectionVersionedAggregateRepo',
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
    yield* SelectionVersionedAggregateRepo.fixedDORepoConfig.nameUtils.makeName(
      key,
    );
  const repo = yield* SelectionVersionedAggregateRepo.getRepo({
    key,
  });
  yield* callSelectionVersionedAggregateRepo(repo, name);
});

declare const SelectionVersionedAggregateRepo: {
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
declare function callSelectionVersionedAggregateRepo(
  repo: unknown,
  name: string,
): Effect.Effect<void>;
