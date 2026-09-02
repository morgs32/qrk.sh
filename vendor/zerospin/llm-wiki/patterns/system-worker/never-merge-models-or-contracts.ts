import { Effect } from 'effect';

/**
 * Each materialized runtime boundary owns one models map and one contracts map.
 *
 * @bad Build module-level `systemModels` by reducing aggregate and service registries.
 * @bad Fall back to all service models when `aggregateName` is missing on aggregate paths.
 * @bad Scan `system.services` during aggregate command materialization.
 */
export const applyAggregateCommand = Effect.fn('applyAggregateCommand')(
  function* (props: {
    aggregateName: string;
    mutations: readonly unknown[];
    system: {
      aggregates: Record<string, { models: Record<string, unknown> }>;
    };
  }) {
    const aggregate = yield* getByKeyOrThrow({
      record: props.system.aggregates,
      key: props.aggregateName,
      recordKind: 'aggregates',
    });

    yield* applyMutationsToResourcesInTx({
      mutations: props.mutations,
      models: aggregate.models,
    });
  },
);

declare function getByKeyOrThrow(props: {
  record: Record<string, { models: Record<string, unknown> }>;
  key: string;
  recordKind: string;
}): Effect.Effect<{ models: Record<string, unknown> }>;
declare function applyMutationsToResourcesInTx(props: {
  mutations: readonly unknown[];
  models: Record<string, unknown>;
}): Effect.Effect<void>;
