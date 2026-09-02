import { Effect } from 'effect';

/**
 * Persist the exact prefixed materialized Repo name selected at admission and pass it unchanged to `getByName` during execution or delivery.
 *
 * @bad Rebuild the Durable Object name from partial entity coordinates later.
 * @bad Store a Durable Object identity in a generic `name` column.
 * @bad Strip the Repo prefix or retry an unprefixed legacy name when lookup fails.
 */
export const dispatch = Effect.fn('AggregateCommandChain.dispatch')(
  function* (props: {
    command: unknown;
    materializedAggregateRepoName: string;
  }) {
    const materializedAggregateRepo = env.MATERIALIZED_AGGREGATE_REPO.getByName(
      props.materializedAggregateRepoName,
    );
    return yield* Effect.promise(() =>
      materializedAggregateRepo.execute({ command: props.command }),
    );
  },
);

declare const env: {
  MATERIALIZED_AGGREGATE_REPO: {
    getByName(name: string): {
      execute(props: { command: unknown }): Promise<unknown>;
    };
  };
};
