import { Effect } from 'effect';

/**
 * AggregateRepo finalization resolves contracts from the named aggregate only.
 *
 * @bad Scan `system.services` during aggregate command finalization.
 * @bad Use `Object.values(aggregate.contracts).find(...)` instead of keyed lookup.
 * @bad Flat-map every aggregate when the named aggregate misses.
 */
export const resolveAggregateContract = Effect.fn('resolveAggregateContract')(
  function* (props: {
    system: {
      aggregates: Record<
        string,
        { contracts: Record<string, { commandName: string; program: unknown }> }
      >;
    };
    aggregateName: string;
    command: { commandName: string };
  }) {
    const { aggregateName, command, system } = props;

    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: aggregateName,
      recordKind: 'aggregates',
    });

    return yield* getByKeyOrThrow({
      record: aggregate.contracts,
      key: command.commandName,
      recordKind: 'aggregate contracts',
    });
  },
);

declare function getByKeyOrThrow<VALUE>(props: {
  record: Record<string, VALUE>;
  key: string;
  recordKind: string;
}): Effect.Effect<VALUE, unknown>;
