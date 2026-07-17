import { Effect } from 'effect';

/**
 * AccountRepo finalization resolves contracts from `account.contracts` only.
 *
 * @bad Scan `system.serviceControllers` during account finalize.
 * @bad Use `Object.values(account.contracts).find(...)` instead of keyed lookup.
 * @bad FlatMap every account controller when the named account misses.
 */
export const resolveAccountContract = Effect.fn('resolveAccountContract')(
  function* (props: {
    system: {
      accountControllers: Record<
        string,
        { contracts: Record<string, { commandName: string; program: unknown }> }
      >;
    };
    accountName: string;
    command: { commandName: string };
  }) {
    const { system, accountName, command } = props;

    const account = yield* getByKeyOrThrow({
      record: system.accountControllers,
      key: accountName,
      recordKind: 'accountControllers',
    });

    const contract = yield* getByKeyOrThrow({
      record: account.contracts,
      key: command.commandName,
      recordKind: 'account contracts',
    });

    return contract;
  },
);

declare function getByKeyOrThrow(props: {
  record: Record<string, unknown>;
  key: string;
  recordKind: string;
}): Effect.Effect<unknown, unknown, unknown>;
