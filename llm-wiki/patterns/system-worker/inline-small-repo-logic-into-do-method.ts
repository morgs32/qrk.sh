import { Effect } from 'effect';

/**
 * Inline non-public one-consumer Repo logic into the owning public method file.
 *
 * @bad Create `shared/applyOneCommand.ts` for a helper called once.
 * @bad Add a module-level helper above the public method when its only caller is that method.
 * @bad Inline a public system-worker Repo RPC method back into the class file.
 */
export const execute = Effect.fn('MaterializedAggregateRepo.execute')(
  function* (props: { command: unknown; db: unknown }) {
    return yield* makeTx({
      db: props.db,
      program: Effect.fn('MaterializedAggregateRepo.execute.transaction')(
        function* ({ tx }) {
          return yield* applyCommandTx({ command: props.command, tx });
        },
      ),
    });
  },
);

export class MaterializedAggregateRepo {
  async execute(props: { command: unknown }) {
    return managedRuntime.runPromise(
      execute({ command: props.command, db: this.db }).pipe(encodeRpc),
    );
  }

  db = {};
}

declare const managedRuntime: {
  runPromise: (effect: unknown) => Promise<unknown>;
};
declare const makeTx: (props: {
  db: unknown;
  program: unknown;
}) => Effect.Effect<unknown, unknown, unknown>;
declare const applyCommandTx: (props: {
  command: unknown;
  tx: unknown;
}) => Effect.Effect<unknown, unknown, unknown>;
declare const encodeRpc: (effect: unknown) => unknown;
