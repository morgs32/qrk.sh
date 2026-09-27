import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { Effect } from 'effect';

/**
 * Inline non-public one-consumer Repo logic into the owning public method file.
 *
 * @bad Create `shared/applyOneCommand.ts` for a helper called once.
 * @bad Add a module-level helper above the public method when its only caller is that method.
 * @bad Inline a public system-worker Repo RPC method back into the class file.
 */
export const execute = Effect.fn('AggregateVersionRepo.execute')(
  function* (props: { command: unknown; db: IDb }) {
    return yield* makeTx('AggregateVersionRepo.execute.transaction')(function* (
      tx: ITx,
    ) {
      return yield* applyCommandTx({ command: props.command, tx });
    })(props.db);
  },
);

export class AggregateVersionRepo {
  async execute(props: { command: unknown }) {
    return managedRuntime.runPromise(
      execute({ command: props.command, db: this.db }).pipe(settleResult),
    );
  }

  declare db: IDb;
}

declare const managedRuntime: {
  runPromise: (effect: unknown) => Promise<unknown>;
};
declare const applyCommandTx: (props: {
  command: unknown;
  tx: ITx;
}) => Effect.Effect<unknown>;
declare const settleResult: (effect: unknown) => unknown;
