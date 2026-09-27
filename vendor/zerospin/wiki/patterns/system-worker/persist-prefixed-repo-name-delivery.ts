import { Effect } from 'effect';

/**
 * Persist the exact prefixed Repo name for subscriber delivery.
 * VersionedAggregateRepo is selected by the four-field key
 * `{ systemId, aggregateId, aggregateName, aggregateVersion }`, not by a
 * per-command stored name.
 *
 * @bad Rebuild the Durable Object name from partial entity coordinates later.
 * @bad Store a Durable Object identity in a generic `name` column.
 * @bad Strip the Repo prefix or retry an unprefixed legacy name when lookup fails.
 * @bad Persist a per-command VersionedAggregateRepo name; look up the current base or named destination version.
 */
export const dispatch = Effect.fn('AggregateChain.dispatch')(function* (props: {
  aggregateIndex: number;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: string;
  };
}) {
  const versionedAggregateRepo = yield* VersionedAggregateRepo.getRepo({
    key: props.key,
  });
  return yield* Effect.promise(() =>
    versionedAggregateRepo.execute({
      aggregateIndex: props.aggregateIndex,
    }),
  );
});

declare const VersionedAggregateRepo: {
  getRepo: (props: {
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
    };
  }) => Effect.Effect<{
    execute(props: { aggregateIndex: number }): Promise<unknown>;
  }>;
};
