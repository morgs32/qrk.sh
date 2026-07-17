import { Effect } from 'effect';

/**
 * Each runtime boundary owns one models map and one contracts map.
 *
 * @bad Build module-level `systemModels` by reducing account + service controllers.
 * @bad Fall back to all service models when `accountName` is missing on account paths.
 * @bad Scan `system.serviceControllers` during account command finalization.
 */
export const applyFinalizationEventFanoutMutations = Effect.fn(
  'applyFinalizationEventFanoutMutations',
)(function* (props: {
  system: {
    accountControllers: Record<
      string,
      { models: Record<string, unknown>; contracts: Record<string, unknown> }
    >;
  };
  accountName: string;
  mutations: readonly unknown[];
}) {
  const { system, accountName, mutations } = props;

  const account = yield* getByKeyOrThrow({
    record: system.accountControllers,
    key: accountName,
    recordKind: 'accountControllers',
  });

  yield* applyMutationsToResourcesInTx({
    mutations,
    models: account.models,
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
