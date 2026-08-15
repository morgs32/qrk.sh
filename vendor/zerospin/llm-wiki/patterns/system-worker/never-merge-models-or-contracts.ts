import { Effect } from 'effect';

/**
 * Each runtime boundary owns one models map and one contracts map.
 *
 * @bad Build module-level `systemModels` by reducing aggregate and service registries.
 * @bad Fall back to all service models when `aggregateName` is missing on aggregate paths.
 * @bad Scan `system.services` during aggregate command finalization.
 */
export const applyAggregateBlockMutations = Effect.fn(
  'applyAggregateBlockMutations',
)(function* (props: {
  system: {
    aggregates: Record<
      string,
      { models: Record<string, unknown>; contracts: Record<string, unknown> }
    >;
  };
  aggregateName: string;
  mutations: readonly unknown[];
}) {
  const { aggregateName, mutations, system } = props;

  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: aggregateName,
    recordKind: 'aggregates',
  });

  yield* applyMutationsToResourcesInTx({
    mutations,
    models: aggregate.models,
  });
});

declare function getByKeyOrThrow(props: {
  record: Record<string, unknown>;
  key: string;
  recordKind: string;
}): Effect.Effect<unknown, unknown, unknown>;

declare function applyMutationsToResourcesInTx(props: {
  mutations: readonly unknown[];
  models: Record<string, unknown>;
}): Effect.Effect<void, unknown, unknown>;
