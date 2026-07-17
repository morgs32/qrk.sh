import { Effect } from 'effect';

declare function getByKeyOrThrow<K extends string, V>(props: {
  record: Record<K, V>;
  key: K;
  recordKind: string;
}): Effect.Effect<V, unknown>;

declare function makeCommand(props: {
  contractVersion: number;
}): Effect.Effect<unknown, unknown, never>;

/**
 * Named contract lookup uses `getByKeyOrThrow` — not direct index access or linear search.
 *
 * @bad `system.contracts[contractName]` without a missing-key domain error.
 * @bad `Object.values(contracts).find(c => c.commandName === command.commandName)`.
 */
export const makeSystemCommand = Effect.fn('makeSystemCommand')(
  function* (props: {
    system: {
      contracts: Record<string, { version: number; commandName: string }>;
    };
    contractName: string;
  }) {
    const { system, contractName } = props;

    const contract = yield* getByKeyOrThrow({
      record: system.contracts,
      key: contractName,
      recordKind: 'contracts',
    });

    const command = yield* makeCommand({ contractVersion: contract.version });
    return command;
  },
);
