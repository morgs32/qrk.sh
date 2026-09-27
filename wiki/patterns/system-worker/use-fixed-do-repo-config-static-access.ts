import { Effect } from 'effect';

/**
 * Use `fixedDORepoConfig` for static Repo metadata and the inherited `Repo.getRepo` static for Durable Object stub lookup.
 *
 * @bad Call `AggregateActorVersionRepo.fixedDORepoConfig.getRepo(...)`.
 * @bad Cast the Repo class to recover helper typing for a one-off test call.
 * @bad Define a local one-call lookup shim around the inherited static lookup.
 */
export const useAggregateActorVersionRepo = Effect.fn(
  'useAggregateActorVersionRepo',
)(function* () {
  const key = {
    systemId: 'sys_1',
    aggregateId: 'acct_1',
    aggregateName: 'shopper',
    aggregateVersion: '1.0.0',
    actorPath: '/user_owner',
    sessionName: 'default',
  };
  const name =
    yield* AggregateActorVersionRepo.fixedDORepoConfig.nameUtils.makeName(key);
  const repo = yield* AggregateActorVersionRepo.getRepo({
    key,
  });
  yield* callAggregateActorVersionRepo(repo, name);
});

declare const AggregateActorVersionRepo: {
  getRepo(props: {
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
      actorPath: string;
      sessionName: string;
    };
  }): Effect.Effect<unknown>;
  fixedDORepoConfig: {
    nameUtils: {
      makeName(props: {
        systemId: string;
        aggregateId: string;
        aggregateName: string;
        aggregateVersion: string;
        actorPath: string;
        sessionName: string;
      }): Effect.Effect<string>;
    };
  };
};
declare function callAggregateActorVersionRepo(
  repo: unknown,
  name: string,
): Effect.Effect<void>;
