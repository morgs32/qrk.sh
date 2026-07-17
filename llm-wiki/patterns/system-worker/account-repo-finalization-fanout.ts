import { Effect } from 'effect';

/**
 * AccountRepo finalization fanout: split private steps; subscribe archive subscribers in constructor bootstrap.
 *
 * @bad Module-level `closeAccountBatch` that subscribe + publish + cursor on every finalize.
 * @bad Register archive subscribers on every finalize RPC.
 * @bad One KV flag for multiple archive subscribers.
 * @bad Put raw mutation fields on fanout payload instead of `encodeAppliedMutation` output.
 */
export class AccountRepo {
  bootstrap = Effect.fn('AccountRepo.bootstrap')(function* (props: {
    accountId: string;
  }) {
    yield* registerArchiveSubscriber({ accountId: props.accountId });
    yield* registerAccountInSystemRepo({ accountId: props.accountId });
  });

  finalizeAccountBlock = Effect.fn('AccountRepo.finalizeAccountBlock')(
    function* (props: {
      accountId: string;
      accountName: string;
      executedCommands: readonly unknown[];
      failedCommands: readonly unknown[];
      appliedMutations: readonly unknown[];
    }) {
      const accountBlock = yield* this.makeAccountBlock(props);
      yield* this.publishAccountBlock({
        accountBlock,
        executedCommands: props.executedCommands,
      });
      return {
        accountBlock,
        executedCommands: props.executedCommands,
        failedCommands: props.failedCommands,
      };
    },
  );

  makeAccountBlock = Effect.fn('AccountRepo.makeAccountBlock')(function* () {
    return { payload: {} };
  });

  publishAccountBlock = Effect.fn('AccountRepo.publishAccountBlock')(
    function* () {
      return undefined;
    },
  );
}

declare function registerArchiveSubscriber(props: {
  accountId: string;
}): Effect.Effect<void, unknown, unknown>;

declare function registerAccountInSystemRepo(props: {
  accountId: string;
}): Effect.Effect<void, unknown, unknown>;

declare const encodeAppliedMutation: (props: {
  mutation: unknown;
}) => Effect.Effect<unknown, unknown, unknown>;
