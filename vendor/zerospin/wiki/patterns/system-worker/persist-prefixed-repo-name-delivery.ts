import { Effect } from 'effect';

/**
 * Persist the exact prefixed Repo name for subscriber delivery.
 * AggregateVersionRepo is selected by the four-field key
 * `{ systemId, aggregateId, aggregateName, aggregateVersion }`, not by a
 * per-command stored name.
 *
 * @bad Rebuild the Durable Object name from partial entity coordinates later.
 * @bad Store a Durable Object identity in a generic `name` column.
 * @bad Strip the Repo prefix or retry an unprefixed legacy name when lookup fails.
 * @bad Persist a per-command AggregateVersionRepo name; look up the current base or named destination version.
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
  const aggregateVersionRepo = yield* AggregateVersionRepo.getRepo({
    key: props.key,
  });
  return yield* Effect.promise(() =>
    aggregateVersionRepo.execute({
      aggregateIndex: props.aggregateIndex,
    }),
  );
});

declare const AggregateVersionRepo: {
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
