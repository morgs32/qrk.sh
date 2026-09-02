import { Effect } from 'effect';

/**
 * MaterializedAggregateRepo resolves the command contract from the named aggregate only.
 *
 * @bad Scan `system.services` during aggregate command execution.
 * @bad Search every aggregate after the named aggregate misses.
 * @bad Replace keyed contract lookup with an `Object.values(...).find(...)` scan.
 */
export const resolveAggregateContract = Effect.fn('resolveAggregateContract')(
  function* (props: {
    aggregateName: string;
    command: { commandName: string };
    system: {
      aggregates: Record<
        string,
        { contracts: Record<string, { commandName: string; program: unknown }> }
      >;
    };
  }) {
    const aggregate = yield* getByKeyOrThrow({
      record: props.system.aggregates,
      key: props.aggregateName,
      recordKind: 'aggregates',
    });
    return yield* getByKeyOrThrow({
      record: aggregate.contracts,
      key: props.command.commandName,
      recordKind: 'aggregate contracts',
    });
  },
);

declare function getByKeyOrThrow<VALUE>(props: {
  record: Record<string, VALUE>;
  key: string;
  recordKind: string;
}): Effect.Effect<VALUE, unknown>;
